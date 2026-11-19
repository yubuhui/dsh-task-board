/**
 * Exercise the task-board Host half without DSH: mount `apply()` on a fake
 * context, capture the tools and the board route, and drive them against a
 * temporary `DSH_HOME` so the user's real board is never touched.
 *
 * The contract under test: the agent may read the board and may open a
 * "new task" card, but only the user's click (the same route the panel uses)
 * writes a task. There is no tool that changes a task's status.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'task-board-tools-'))
process.env.DSH_HOME = home

/** The board already holds one task, so parent lookups have something real. */
const parent = {
  id: 'parent-1',
  title: '瀛络小程序',
  status: 'todo',
  priority: 'medium',
  due: null,
  note: '',
  assignees: [],
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  doneAt: null,
}
mkdirSync(join(home, 'task-board'), { recursive: true })
const storePath = join(home, 'task-board', 'tasks.json')
writeFileSync(storePath, JSON.stringify({ version: 1, tasks: [parent] }), 'utf8')
const before = readFileSync(storePath, 'utf8')

const { apply, inject } = await import('../index.js')

/** One captured tool. */
const tools = new Map()
/** One captured web route. */
const routes = []

const ctx = {
  effect(run) {
    const dispose = run()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  webServer: {
    register(config) {
      routes.push(config)
      return () => {}
    },
  },
  sessionQuery: {
    async readSession() {
      return { events: [] }
    },
  },
  agents: {
    get() {
      return undefined
    },
  },
  tools: {
    register(tool) {
      tools.set(tool.name, tool)
      return () => {}
    },
  },
}

apply(ctx)

assert.deepEqual([...tools.keys()].sort(), ['task_board_list', 'task_board_propose'])
assert.ok(inject.includes('tools'), 'the Host half must declare the tools service')
assert.equal(routes.length, 1, 'the board route must still be registered')

const list = tools.get('task_board_list')
const propose = tools.get('task_board_propose')

for (const tool of [list, propose]) {
  assert.equal(tool.parameters.type, 'object')
  assert.equal(tool.output.schema.type, 'object')
  assert.equal(typeof tool.output.render, 'function')
  assert.equal(typeof tool.execute, 'function')
}

assert.ok(!tools.has('task_board_update'), 'the agent must not be able to change a task')
assert.ok(!tools.has('task_board_create'), 'creating is a card the user confirms, not a tool side effect')

/**
 * Check one canonical value against the declared output shape.
 * @param tool - definition whose schema is enforced.
 * @param value - canonical value returned by execute.
 */
function assertOutput(tool, value) {
  const { schema } = tool.output
  assert.deepEqual(Object.keys(value).sort(), [...schema.required].sort())
  assert.equal(schema.additionalProperties, false)
  for (const [key, field] of Object.entries(schema.properties)) {
    const expected = field.type === 'integer' ? 'number' : field.type
    assert.equal(typeof value[key], expected, `${tool.name}.${key} must be a ${expected}`)
  }
}

const listed = await list.execute({})
assertOutput(list, listed)
assert.equal(listed.total, 1)
assert.match(listed.text, /瀛络小程序/)

const proposal = await propose.execute({ title: '写周报', priority: 'high', due: '2026-11-20', note: '周五前提交' })
assertOutput(propose, proposal)
assert.equal(proposal.title, '写周报')
assert.equal(proposal.priority, 'high')
assert.equal(proposal.due, '2026-11-20')
assert.match(proposal.text, /是否创建由你/)
assert.equal(readFileSync(storePath, 'utf8'), before, 'proposing a task must not write the board')

const meta = propose.output.presentationMeta({}, proposal)
assert.deepEqual(Object.keys(meta).sort(), ['due', 'note', 'parentId', 'parentTitle', 'priority', 'title'])

const blank = await propose.execute({})
assert.equal(blank.title, '')
assert.equal(blank.priority, 'medium')
assert.match(blank.text, /空白/)

const child = await propose.execute({ title: '汇总数据', parentId: parent.id })
assert.equal(child.parentTitle, '瀛络小程序')
assert.match(child.text, /父任务「瀛络小程序」/)

await assert.rejects(() => propose.execute({ title: 'x', due: '2026/11/20' }), /YYYY-MM-DD/)
await assert.rejects(() => propose.execute({ title: 'x', parentId: 'missing' }), /父任务不存在/)

/** A response that records what the route wrote. */
function fakeResponse() {
  const record = { status: 0, body: '' }
  return {
    record,
    writeHead(status) {
      record.status = status
    },
    end(text) {
      record.body = text ?? ''
    },
  }
}

/** A request with one JSON body, shaped the way `readBody` consumes it. */
function fakeRequest(method, url, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return {
    method,
    url,
    headers: { 'x-task-board': '1' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

const route = routes[0].handler
const denied = fakeResponse()
await route({ method: 'GET', url: '/plugin/task-board/tasks', headers: {} }, denied)
assert.equal(denied.record.status, 403, 'the board route keeps its request guard')

// This is exactly what the card's 「创建」 button posts after the user clicks.
const created = fakeResponse()
await route(fakeRequest('POST', '/plugin/task-board/tasks', {
  title: '写周报',
  priority: 'high',
  due: '2026-11-20',
  note: '周五前提交',
}), created)
assert.equal(created.record.status, 201)
const payload = JSON.parse(created.record.body)
assert.equal(payload.created.title, '写周报')
assert.equal(payload.tasks.length, 2)

const after = await list.execute({})
assert.equal(after.total, 2)
assert.equal(after.open, 2)
assert.match(after.text, /写周报/)

const withChild = fakeResponse()
await route(fakeRequest('POST', '/plugin/task-board/tasks', { title: '汇总数据', parentId: parent.id }), withChild)
assert.equal(withChild.record.status, 201)

const board = JSON.parse(readFileSync(storePath, 'utf8'))
assert.equal(board.tasks.length, 3)
assert.equal(board.tasks.find(task => task.title === '汇总数据').parentId, parent.id)

const nested = await list.execute({})
assert.match(nested.text, /^ {2}- 汇总数据/m, 'a subtask is indented under its parent')

console.log('tools:', [...tools.keys()].join(', '))
console.log('--- list text ---')
console.log(nested.text)
console.log('--- proposal text ---')
console.log(proposal.text)
console.log('ok: the agent reads and proposes; only the confirmed card writes')

rmSync(home, { recursive: true, force: true })
