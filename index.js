/**
 * Host half of the task board.
 *
 * Owns the durable task records the user manages by hand: create, edit,
 * delete, status, priority, due date, progress note, multi-level subtasks and
 * the Sessions each task is assigned to. The browser half only renders and
 * calls these routes; nothing here derives a task from a Session log.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Prefix every route of this plugin lives under; the prefix table appends the separator itself. */
const PREFIX = '/plugin/task-board'
/** Request header the browser half sends; a cross-site include cannot set it. */
const GUARD_HEADER = 'x-task-board'
/** Largest JSON body accepted from the browser. */
const BODY_LIMIT = 256 * 1024
/** Statuses a task may hold, in lifecycle order. */
const STATUSES = ['todo', 'active', 'blocked', 'done']
/** Priorities a task may hold, highest first. */
const PRIORITIES = ['high', 'medium', 'low']
/** Longest accepted values, so one field cannot fill the file. */
const LIMITS = { title: 500, note: 4000, assignees: 32 }
/** Messages one transcript response carries, and the text budget behind them. */
const TRANSCRIPT = { messages: 200, chars: 64000 }
/** Chinese labels used only in tool text; stored values stay the English codes. */
const STATUS_LABELS = { todo: '待办', active: '进行中', blocked: '受阻', done: '已完成' }
/** Chinese priority labels used only in tool text. */
const PRIORITY_LABELS = { high: '高', medium: '中', low: '低' }
/** Rank behind the sibling order the board uses. */
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 }

/**
 * Resolve the durable store path inside the installation's home directory.
 * @returns absolute path of the task file.
 */
function storeFile() {
  const home = process.env.DSH_HOME
  const base = typeof home === 'string' && home.length > 0 ? home : join(homedir(), '.dsh')
  return join(base, 'task-board', 'tasks.json')
}

/**
 * Answer one browser request with JSON.
 * @param res - Node response.
 * @param status - HTTP status code.
 * @param body - JSON-serializable payload.
 */
function send(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

/**
 * Read one error's message.
 * @param error - caught value.
 * @returns readable text.
 */
function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

/** A refusal the caller should report as an HTTP status. */
class HttpError extends Error {
  /**
   * @param status - HTTP status code.
   * @param message - caller-facing reason.
   */
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/**
 * Read and parse a JSON request body.
 * @param req - Node request.
 * @returns the parsed object, or an empty object for a body-less request.
 */
async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > BODY_LIMIT) throw new HttpError(413, 'body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  let parsed
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'body is not JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, 'body must be an object')
  }
  return parsed
}

/**
 * Trim one optional string field.
 * @param value - raw field value.
 * @param limit - longest accepted text.
 * @returns the trimmed text, or undefined when the value is not a usable string.
 */
function optionalText(value, limit) {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (text.length === 0) return undefined
  return text.slice(0, limit)
}

/**
 * Normalize one stored or submitted task field set.
 * @param raw - untrusted record.
 * @returns values that satisfy the record contract.
 */
function normalizeFields(raw) {
  const fields = {}
  const title = optionalText(raw.title, LIMITS.title)
  if (title !== undefined) fields.title = title
  if (typeof raw.note === 'string') fields.note = raw.note.slice(0, LIMITS.note)
  if (STATUSES.includes(raw.status)) fields.status = raw.status
  if (PRIORITIES.includes(raw.priority)) fields.priority = raw.priority
  if (typeof raw.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.due)) fields.due = raw.due
  else if (raw.due === null) fields.due = null
  if (Array.isArray(raw.assignees)) {
    fields.assignees = raw.assignees
      .filter(id => typeof id === 'string' && id.length > 0)
      .slice(0, LIMITS.assignees)
  }
  if (typeof raw.parentId === 'string' && raw.parentId.length > 0) fields.parentId = raw.parentId
  else if (raw.parentId === null) fields.parentId = null
  return fields
}

/**
 * Coerce one persisted record into the task shape, or drop it.
 * @param raw - untrusted persisted value.
 * @returns the task, or undefined when it cannot be read as one.
 */
function readStoredTask(raw) {
  if (typeof raw !== 'object' || raw === null) return undefined
  if (typeof raw.id !== 'string' || raw.id.length === 0) return undefined
  if (typeof raw.title !== 'string' || raw.title.length === 0) return undefined
  const fields = normalizeFields(raw)
  return {
    id: raw.id,
    title: raw.title.slice(0, LIMITS.title),
    status: fields.status ?? 'todo',
    priority: fields.priority ?? 'medium',
    due: fields.due ?? null,
    note: fields.note ?? '',
    assignees: fields.assignees ?? [],
    parentId: fields.parentId ?? null,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
    doneAt: Number.isFinite(raw.doneAt) ? raw.doneAt : null,
  }
}

/**
 * Drop parent references that point at a missing task, or that would close a
 * cycle, so a damaged file still yields a usable tree.
 *
 * Each task walks its own ancestor chain with a private visited set: a shared
 * set would see a second child of the same parent as a "repeat" and detach that
 * parent, which silently broke every moved subtask that had children.
 * @param tasks - normalized tasks.
 * @returns tasks whose parent chain is intact.
 */
function repairParents(tasks) {
  const byId = new Map(tasks.map(task => [task.id, task]))
  for (const task of tasks) {
    if (task.parentId !== null && !byId.has(task.parentId)) task.parentId = null
  }
  for (const task of tasks) {
    const path = new Set([task.id])
    let parent = task.parentId === null ? undefined : byId.get(task.parentId)
    while (parent !== undefined) {
      if (path.has(parent.id)) {
        // This task closes a loop in its own ancestry; drop its parent link.
        task.parentId = null
        break
      }
      path.add(parent.id)
      parent = parent.parentId === null ? undefined : byId.get(parent.parentId)
    }
  }
  return tasks
}

/**
 * Order two sibling tasks the way the board shows them.
 * @param left - first task.
 * @param right - second task.
 * @returns negative when the first task comes first.
 */
function compareTasks(left, right) {
  const done = (left.status === 'done' ? 1 : 0) - (right.status === 'done' ? 1 : 0)
  if (done !== 0) return done
  const rank = (PRIORITY_RANK[left.priority] ?? 1) - (PRIORITY_RANK[right.priority] ?? 1)
  if (rank !== 0) return rank
  if (left.due !== right.due) {
    if (left.due === null) return 1
    if (right.due === null) return -1
    return left.due < right.due ? -1 : 1
  }
  return left.updatedAt - right.updatedAt
}

/**
 * Flatten tasks into board order with a depth for indentation.
 * @param tasks - tasks to order; a task whose parent is absent counts as a root.
 * @returns tree rows, parents before their children.
 */
function flattenTasks(tasks) {
  const ids = new Set(tasks.map(task => task.id))
  const children = new Map()
  for (const task of tasks) {
    const key = task.parentId !== null && ids.has(task.parentId) ? task.parentId : ''
    const list = children.get(key)
    if (list === undefined) children.set(key, [task])
    else list.push(task)
  }
  const rows = []
  const seen = new Set()
  const walk = (key, depth) => {
    const list = children.get(key)
    if (list === undefined) return
    list.sort(compareTasks)
    for (const task of list) {
      if (seen.has(task.id)) continue
      seen.add(task.id)
      rows.push({ task, depth })
      walk(task.id, depth + 1)
    }
  }
  walk('', 0)
  return rows
}

/**
 * Collapse one text to a single bounded line.
 * @param text - raw text.
 * @param limit - longest accepted line.
 * @returns the flattened text.
 */
function inlineText(text, limit) {
  const flat = String(text).replace(/\s+/g, ' ').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`
}

/**
 * Render the board as compact text for a tool result.
 * @param tasks - tasks to show, already filtered.
 * @param all - every task, for the counts.
 * @param limit - most rows to render.
 * @returns the text plus how many rows were shown and omitted.
 */
function boardText(tasks, all, limit) {
  const open = all.filter(task => task.status !== 'done').length
  const header = `任务面板：共 ${all.length} 条，未完成 ${open} 条，已完成 ${all.length - open} 条`
  const rows = flattenTasks(tasks)
  if (rows.length === 0) return { text: `${header}\n（没有符合条件的任务）`, shown: 0, omitted: 0 }
  const kept = rows.slice(0, limit)
  const lines = kept.map(({ task, depth }) => {
    const details = [STATUS_LABELS[task.status] ?? task.status, PRIORITY_LABELS[task.priority] ?? task.priority]
    let line = `${'  '.repeat(depth)}- ${inlineText(task.title, 80)} · ${details[0]}/${details[1]}`
    if (task.due !== null) line += ` · 截止 ${task.due}`
    if (task.note !== '') line += ` · 备注 ${inlineText(task.note, 60)}`
    return `${line} · id=${task.id}`
  })
  const omitted = rows.length - kept.length
  if (omitted > 0) lines.push(`…还有 ${omitted} 条未显示；提高 limit 或用 query 缩小范围`)
  return { text: [header, ...lines].join('\n'), shown: kept.length, omitted }
}

/**
 * Join the plain-text blocks of one message or event content list.
 * @param content - content blocks, when the value is a list.
 * @returns the joined text, or an empty string.
 */
function textOf(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n').trim()
}

/**
 * Handler for transcript requests, declared after `apply` closes over services.
 * @param ctx - Host plugin context.
 * @returns a function from a session id to a transcript payload.
 */
function transcriptReader(ctx) {
  /**
   * Read one Session's conversation as a flat, renderable transcript.
   * @param sessionId - Session to read.
   * @returns the transcript payload the pane renders.
   */
  return async function transcriptOf(sessionId) {
    const log = await ctx.sessionQuery.readSession(sessionId)
    let title
    const collected = []
    for (const event of log.events) {
      const data = event.data ?? {}
      if (event.type === 'session/title') {
        if (typeof data.title === 'string' && data.title.length > 0) title = data.title
        continue
      }
      if (event.type === 'user/message') {
        const text = textOf(data.content)
        if (text.length > 0) {
          collected.push({ role: 'user', text, tools: [], at: event.time, seq: event.seq })
        }
        continue
      }
      if (event.type === 'assistant/message') {
        const message = data.message ?? {}
        const content = message.content
        const text = textOf(content)
        const tools = Array.isArray(content)
          ? content.filter(block => block !== null && typeof block === 'object' && block.type === 'tool-call'
            && typeof block.name === 'string').map(block => block.name)
          : []
        if (text.length > 0 || tools.length > 0) {
          collected.push({ role: 'assistant', text, tools, at: event.time, seq: event.seq })
        }
      }
    }
    const headSeq = collected.length === 0 ? 0 : collected[collected.length - 1].seq
    const kept = collected.slice(-TRANSCRIPT.messages)
    let budget = TRANSCRIPT.chars
    const messages = []
    for (let index = kept.length - 1; index >= 0; index -= 1) {
      const message = kept[index]
      if (budget - message.text.length < 0 && messages.length > 0) break
      budget -= message.text.length
      messages.unshift(message)
    }
    return {
      sessionId,
      title,
      live: ctx.agents.get(sessionId) !== undefined,
      headSeq,
      dropped: collected.length - messages.length,
      messages,
    }
  }
}

export const inject = ['webServer', 'sessionQuery', 'agents', 'tools']

/**
 * Serve the task board, its durable store, and the transcript of any Session.
 * @param ctx - Host plugin context carrying the web server and Session services.
 */
export function apply(ctx) {
  const readTranscript = transcriptReader(ctx)

  /** @type {{ version: number, tasks: object[] } | null} */
  let state = null
  /** Serialized writes, so two quick requests cannot interleave. */
  let queue = Promise.resolve()

  /**
   * Load the store once, tolerating a missing or damaged file.
   * @returns the live state object.
   */
  async function readState() {
    if (state !== null) return state
    let tasks = []
    try {
      const parsed = JSON.parse(await readFile(storeFile(), 'utf8'))
      if (Array.isArray(parsed.tasks)) {
        tasks = parsed.tasks.map(readStoredTask).filter(task => task !== undefined)
      }
    } catch {
      // A first run has no file yet; a damaged file starts from an empty board
      // instead of blocking every later read.
      tasks = []
    }
    state = { version: 1, tasks: repairParents(tasks) }
    return state
  }

  /**
   * Write the store atomically through a temporary file.
   * @param next - state to persist.
   */
  function persist(next) {
    queue = queue.then(async () => {
      const file = storeFile()
      await mkdir(dirname(file), { recursive: true })
      const temporary = `${file}.${process.pid}.tmp`
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
      await rename(temporary, file)
    }).catch(error => {
      console.error('[task-board] writing the task file failed:', error)
    })
    return queue
  }

  /**
   * Collect one task and every descendant id.
   * @param tasks - current task list.
   * @param id - root of the subtree.
   * @returns ids to remove.
   */
  function subtreeOf(tasks, id) {
    const ids = new Set([id])
    let grew = true
    while (grew) {
      grew = false
      for (const task of tasks) {
        if (task.parentId !== null && ids.has(task.parentId) && !ids.has(task.id)) {
          ids.add(task.id)
          grew = true
        }
      }
    }
    return ids
  }

  /**
   * Create one task.
   * @param body - submitted fields.
   * @returns the created task.
   */
  async function createTask(body) {
    const live = await readState()
    const fields = normalizeFields(body)
    const title = fields.title ?? undefined
    if (title === undefined) throw new HttpError(400, 'title is required')
    if (fields.parentId !== undefined && !live.tasks.some(task => task.id === fields.parentId)) {
      throw new HttpError(400, 'parent task does not exist')
    }
    const now = Date.now()
    const status = fields.status ?? 'todo'
    const task = {
      id: randomUUID(),
      title,
      status,
      priority: fields.priority ?? 'medium',
      due: fields.due ?? null,
      note: fields.note ?? '',
      assignees: fields.assignees ?? [],
      parentId: fields.parentId ?? null,
      createdAt: now,
      updatedAt: now,
      doneAt: status === 'done' ? now : null,
    }
    live.tasks.push(task)
    await persist(live)
    return task
  }

  /**
   * Apply a partial update to one task.
   * @param id - task to update.
   * @param body - fields to change.
   * @returns the updated task.
   */
  async function updateTask(id, body) {
    const live = await readState()
    const task = live.tasks.find(item => item.id === id)
    if (task === undefined) throw new HttpError(404, 'task not found')
    const fields = normalizeFields(body)
    if ('title' in body && fields.title === undefined) throw new HttpError(400, 'title cannot be empty')
    if (fields.parentId !== undefined && fields.parentId !== null) {
      if (fields.parentId === id) throw new HttpError(400, 'a task cannot be its own parent')
      if (!live.tasks.some(item => item.id === fields.parentId)) throw new HttpError(400, 'parent task does not exist')
      if (subtreeOf(live.tasks, id).has(fields.parentId)) throw new HttpError(400, 'a task cannot move into its own subtree')
    }
    for (const [key, value] of Object.entries(fields)) task[key] = value
    if (fields.status !== undefined) task.doneAt = fields.status === 'done' ? (task.doneAt ?? Date.now()) : null
    task.updatedAt = Date.now()
    await persist(live)
    return task
  }

  /**
   * Remove one task and its whole subtree.
   * @param id - subtree root.
   * @returns how many tasks were removed.
   */
  async function removeTask(id) {
    const live = await readState()
    if (!live.tasks.some(task => task.id === id)) throw new HttpError(404, 'task not found')
    const removed = subtreeOf(live.tasks, id)
    live.tasks = live.tasks.filter(task => !removed.has(task.id))
    await persist(live)
    return removed.size
  }

  /**
   * Resolve the title of a task's parent.
   * @param live - board state.
   * @param parentId - parent id, or an empty string.
   * @returns the parent title, or an empty string when there is none.
   */
  function parentTitleOf(live, parentId) {
    if (parentId.length === 0) return ''
    const parent = live.tasks.find(task => task.id === parentId)
    return parent === undefined ? '' : parent.title
  }

  /** Read the board, optionally narrowed by status and a text query. */
  const listTasksTool = {
    name: 'task_board_list',
    description:
      '读取任务面板（右侧栏「任务」页签）里的待办：默认只列未完成，可按标题或备注搜索，返回 id、标题、状态、优先级、截止日期和备注摘要。'
      + '只读，不会修改任何任务；完成状态只能由用户在右侧面板里改。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        filter: {
          type: 'string',
          enum: ['open', 'all', 'done'],
          description: 'open=未完成（默认）、done=已完成、all=全部',
        },
        query: { type: 'string', description: '按标题或备注搜索；省略表示不筛选' },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: '最多返回多少条，默认 50' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['total', 'open', 'done', 'shown', 'omitted', 'text'],
        properties: {
          total: { type: 'integer' },
          open: { type: 'integer' },
          done: { type: 'integer' },
          shown: { type: 'integer' },
          omitted: { type: 'integer' },
          text: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value?.text ?? '' }],
    },
    async execute(args = {}) {
      const filter = args.filter === 'all' || args.filter === 'done' ? args.filter : 'open'
      const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : ''
      const limit = Number.isInteger(args.limit) ? Math.min(Math.max(args.limit, 1), 200) : 50
      const live = await readState()
      const matched = live.tasks.filter(task => {
        if (filter === 'open' && task.status === 'done') return false
        if (filter === 'done' && task.status !== 'done') return false
        if (query.length === 0) return true
        return `${task.title} ${task.note}`.toLowerCase().includes(query)
      })
      const byId = new Map(live.tasks.map(task => [task.id, task]))
      const keep = new Set(matched.map(task => task.id))
      // Keep each match's ancestors, so a subtask is never shown without its parent.
      for (const task of matched) {
        let parentId = task.parentId
        while (parentId !== null && !keep.has(parentId)) {
          keep.add(parentId)
          const parent = byId.get(parentId)
          parentId = parent === undefined ? null : parent.parentId
        }
      }
      const selected = live.tasks.filter(task => keep.has(task.id))
      const view = boardText(selected, live.tasks, limit)
      return {
        total: live.tasks.length,
        open: live.tasks.filter(task => task.status !== 'done').length,
        done: live.tasks.filter(task => task.status === 'done').length,
        shown: view.shown,
        omitted: view.omitted,
        text: view.text,
      }
    },
  }

  /**
   * Offer a new task as an in-chat card. Nothing is written here: the user's
   * click on the card is the only thing that creates a task.
   */
  const proposeTaskTool = {
    name: 'task_board_propose',
    description:
      '在对话里生成一张「新建待办」卡片，把想建的待办预填进去（标题、优先级、截止日期、备注、父任务）。'
      + '是否真的创建由用户点卡片上的「创建」决定：本工具不写入任何数据，用户确认前不要声称任务已建好。'
      + '用户说「建个待办」「记一下」「提醒我」时用它，不要另生成表单让用户再提交一轮。'
      + '一次只提议一条，多条就调用多次。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', description: '预填标题；用户可以再改，留空则卡片打开时是空的' },
        priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '预填优先级，默认 medium' },
        due: { type: 'string', description: '预填截止日期，格式 YYYY-MM-DD；省略表示没有截止日期' },
        note: { type: 'string', description: '预填备注：背景、下一步或验收标准' },
        parentId: { type: 'string', description: '父任务 id（来自 task_board_list），把新待办挂成子任务' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'priority', 'due', 'note', 'parentId', 'parentTitle', 'text'],
        properties: {
          title: { type: 'string' },
          priority: { type: 'string' },
          due: { type: 'string' },
          note: { type: 'string' },
          parentId: { type: 'string' },
          parentTitle: { type: 'string' },
          text: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value?.text ?? '' }],
      // The card reads these fields back from the persisted result metadata.
      presentationMeta: (_args, value) => ({
        title: value.title,
        priority: value.priority,
        due: value.due,
        note: value.note,
        parentId: value.parentId,
        parentTitle: value.parentTitle,
      }),
    },
    async execute(args = {}) {
      const title = typeof args.title === 'string' ? args.title.trim().slice(0, LIMITS.title) : ''
      const priority = PRIORITIES.includes(args.priority) ? args.priority : 'medium'
      const due = typeof args.due === 'string' ? args.due.trim() : ''
      if (due.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error('截止日期要写成 YYYY-MM-DD')
      const note = typeof args.note === 'string' ? args.note.slice(0, LIMITS.note) : ''
      const parentId = typeof args.parentId === 'string' ? args.parentId.trim() : ''
      const live = await readState()
      if (parentId.length > 0 && !live.tasks.some(task => task.id === parentId)) {
        throw new Error('父任务不存在；先用 task_board_list 确认 id')
      }
      const parentTitle = parentTitleOf(live, parentId)
      const head = title.length === 0 ? '已打开一张空白的「新建待办」卡片' : `已生成「新建待办」卡片：${title}`
      const parent = parentTitle === '' ? '' : `（父任务「${parentTitle}」）`
      return {
        title,
        priority,
        due,
        note,
        parentId,
        parentTitle,
        text: `${head}${parent}。是否创建由你在卡片上点「创建」决定。`,
      }
    },
  }

  ctx.tools.register(listTasksTool)
  ctx.tools.register(proposeTaskTool)

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: async (req, res) => {
      if (req.headers[GUARD_HEADER] !== '1') {
        send(res, 403, { error: 'forbidden' })
        return
      }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const rest = url.pathname.slice(PREFIX.length)
      const segments = rest.split('/').filter(part => part.length > 0)
      const collection = segments[0]
      const id = segments[1]
      if (segments.length > 2) {
        send(res, 404, { error: 'unknown route' })
        return
      }
      if (collection === 'transcript') {
        if (req.method !== 'GET') {
          send(res, 405, { error: 'method not allowed' })
          return
        }
        const sessionId = url.searchParams.get('sessionId')
        if (sessionId === null || sessionId.length === 0) {
          send(res, 400, { error: 'sessionId is required' })
          return
        }
        try {
          send(res, 200, await readTranscript(sessionId))
        } catch (error) {
          // A Session whose log cannot be read is reported, not retried here.
          send(res, 404, { error: messageOf(error) })
        }
        return
      }
      if (collection !== 'tasks') {
        send(res, 404, { error: 'unknown route' })
        return
      }
      try {
        const live = await readState()
        if (id === undefined || id.length === 0) {
          if (req.method === 'GET') {
            send(res, 200, { version: live.version, tasks: live.tasks })
            return
          }
          if (req.method === 'POST') {
            const created = await createTask(await readBody(req))
            send(res, 201, { created, tasks: live.tasks })
            return
          }
          send(res, 405, { error: 'method not allowed' })
          return
        }
        if (req.method === 'PATCH') {
          const updated = await updateTask(id, await readBody(req))
          send(res, 200, { updated, tasks: live.tasks })
          return
        }
        if (req.method === 'DELETE') {
          const removed = await removeTask(id)
          send(res, 200, { removed, tasks: live.tasks })
          return
        }
        send(res, 405, { error: 'method not allowed' })
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500
        if (status === 500) console.error('[task-board] request failed:', error)
        send(res, status, { error: messageOf(error) })
      }
    },
  }), 'task-board: task routes')
}
