/**
 * Render the end-of-turn task cards without a browser: load the Client bundle
 * in a fake module loader, fold one Turn's `tool/call` + `tool/result` events
 * through the registered Conversation Definition, then mount the turn-tail
 * component and drive it through confirm / cancel / replay.
 *
 * The card's only write path is the same `/plugin/task-board/tasks` request the
 * right-sidebar pane uses, so this test also asserts the exact POST it sends.
 */
import assert from 'node:assert/strict'

/* ── a tiny React stand-in ─────────────────────────────────────────────── */

/** Hooks read and write through the component instance being rendered. */
let activeInstance = null

const React = {
  createElement(type, props, ...children) {
    return {
      type,
      props: props || {},
      children: children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false && child !== true),
    }
  },
  useState(initial) {
    const instance = activeInstance
    const index = instance.index++
    if (!(index in instance.hooks.states)) {
      instance.hooks.states[index] = typeof initial === 'function' ? initial() : initial
    }
    const set = next => {
      const value = typeof next === 'function' ? next(instance.hooks.states[index]) : next
      if (Object.is(value, instance.hooks.states[index])) return
      instance.hooks.states[index] = value
      instance.root.rerender()
    }
    return [instance.hooks.states[index], set]
  },
  useEffect(effect, deps) {
    const instance = activeInstance
    const index = instance.index++
    const stored = instance.hooks.effects[index]
    const changed = stored === undefined || deps === undefined || stored.deps === null
      || deps.some((dep, position) => !Object.is(dep, stored.deps[position]))
    if (!changed) return
    instance.hooks.effects[index] = { deps: deps === undefined ? null : deps.slice(), cleanup: stored === undefined ? null : stored.cleanup }
    instance.pendingEffects.push(() => {
      if (stored !== undefined && typeof stored.cleanup === 'function') stored.cleanup()
      const cleanup = effect()
      const slot = instance.hooks.effects[index]
      if (slot !== undefined) slot.cleanup = typeof cleanup === 'function' ? cleanup : null
    })
  },
  useSyncExternalStore(_subscribe, getSnapshot) {
    return getSnapshot()
  },
}

/** Create one component instance with its own hook storage. */
function makeInstance(component, props, parent) {
  return {
    component,
    props,
    parent,
    root: null,
    hooks: { states: [], effects: [] },
    children: new Map(),
    index: 0,
    pendingEffects: [],
    tree: null,
  }
}

/** Turn a vnode tree into plain nodes, reusing child instances across renders. */
function toTree(vnode, parent, position) {
  if (vnode === null || vnode === undefined || vnode === false || vnode === true) return null
  if (Array.isArray(vnode)) {
    return vnode.map((child, index) => toTree(child, parent, index)).flat(Infinity).filter(node => node !== null)
  }
  if (typeof vnode === 'string' || typeof vnode === 'number') return { text: String(vnode) }
  if (typeof vnode.type === 'function') {
    const key = vnode.props !== undefined && vnode.props.key !== undefined ? String(vnode.props.key) : 'at:' + position
    let child = parent.children.get(key)
    if (child === undefined) {
      child = makeInstance(vnode.type, vnode.props, parent)
      child.root = parent.root === null ? parent : parent.root
      parent.children.set(key, child)
    } else {
      child.props = vnode.props
    }
    return renderInstance(child)
  }
  const children = (vnode.children || []).map((child, index) => toTree(child, parent, index)).flat(Infinity).filter(node => node !== null)
  return { tag: vnode.type, props: vnode.props, children }
}

/** Render one instance, running its pending effects. */
function renderInstance(instance) {
  instance.index = 0
  instance.pendingEffects = []
  const previous = activeInstance
  activeInstance = instance
  let output
  try {
    output = instance.component(instance.props)
  } finally {
    activeInstance = previous
  }
  for (const run of instance.pendingEffects) run()
  return toTree(output, instance, 0)
}

/** Mount one component as a fresh root. */
function mount(component, props) {
  const root = makeInstance(component, props, null)
  root.root = root
  root.rerender = () => {
    root.tree = renderInstance(root)
    return root.tree
  }
  root.rerender()
  return root
}

/* ── a fake page ───────────────────────────────────────────────────────── */

const storage = new Map()
const localeDictionaries = new Map()
const registrations = []
const definitions = []
let loaded = null

globalThis.document = {
  head: { appendChild() {} },
  createElement() {
    return { textContent: '', setAttribute() {}, remove() {} }
  },
}
globalThis.window = {
  localStorage: {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)) },
    removeItem: key => { storage.delete(key) },
  },
  __ModuleLoader__: {
    load(config) {
      loaded = config
    },
  },
}

await import('../client.js')
assert.notEqual(loaded, null, 'the Client bundle must register itself')
assert.equal(loaded.id, '@local/dsh-task-board')

const module = loaded.factory(name => {
  if (name === 'react') return React
  throw new Error('unexpected require: ' + name)
})

const ctx = {
  effect(run) {
    const dispose = run()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  locale: {
    register(namespace, dictionary) {
      localeDictionaries.set(namespace, dictionary)
    },
    bind(namespace) {
      return key => {
        const dictionary = localeDictionaries.get(namespace)
        const value = dictionary === undefined ? undefined : dictionary.en[key]
        return typeof value === 'string' ? value : ''
      }
    },
  },
  slots: {
    inject(_name, install) {
      return install()
    },
    register(config, Component) {
      registrations.push({ config, Component })
      return () => {}
    },
  },
  uiConversation: {
    events: {
      register(definition) {
        definitions.push(definition)
        return () => {}
      },
    },
  },
  sidebarRightTabs: { register: () => () => {} },
  sidebarRight: { openTab: () => {} },
  layout: {},
  sessions: { list: { getSnapshot: () => ({ byId: {}, ids: [] }) } },
  uiWorkspace: { openSession: () => {} },
  remote: { session: {} },
}

module.apply(ctx)

const tail = registrations.find(entry => entry.config.name === 'conversation.chat.turnTail')
assert.ok(tail, 'the Client must register the end-of-turn card')
assert.equal(tail.config.id, '@local/dsh-task-board')
assert.equal(tail.config.locale, 'task-board')
assert.equal(registrations.filter(entry => entry.config.name === 'tool.call.toolview').length, 0,
  'the card must not also render at the tool call')

assert.equal(definitions.length, 1, 'the Turn data definition must be registered once')
const definition = definitions[0]
assert.equal(definition.kind, 'taskBoard')

/* ── folding one Turn's events ─────────────────────────────────────────── */

const turnStart = { type: 'turn/start', data: { turn: 7 } }
assert.deepEqual(definition.match(turnStart), { id: '7', role: 'start' })
assert.equal(definition.match({ type: 'tool/call', data: { turn: 7, callId: 'c0', name: 'task_board_list', arguments: '{}' } }), null)
assert.equal(definition.match({ type: 'user/message', data: { content: [] } }), null)

let state = definition.start({}, { event: turnStart })
assert.equal(state.proposals.length, 0)

const proposeCall = {
  type: 'tool/call',
  data: { turn: 7, step: 1, callId: 'call-a', name: 'task_board_propose', arguments: '{"title":"写周报"}' },
}
assert.deepEqual(definition.match(proposeCall), { id: '7', role: 'update' })
state = definition.update({ state }, { event: proposeCall })

const meta = { title: '写周报', priority: 'high', due: '2026-11-20', note: '周五前提交', parentId: '', parentTitle: '' }
const resultEvent = {
  type: 'tool/result',
  data: { turn: 7, step: 1, message: { isError: false, source: { callId: 'call-a' } }, meta },
}
state = definition.update({ state }, { event: resultEvent })

// A failed proposal, and a result of another tool, contribute nothing.
state = definition.update({ state }, {
  event: { type: 'tool/result', data: { turn: 7, message: { isError: true, source: { callId: 'call-a' } }, meta } },
})
state = definition.update({ state }, {
  event: { type: 'tool/result', data: { turn: 7, message: { isError: false, source: { callId: 'other' } }, meta } },
})
assert.equal(state.proposals.length, 1)

// Replaying the same result replaces instead of appending.
state = definition.update({ state }, { event: resultEvent })
assert.equal(state.proposals.length, 1)

const location = definition.buildLocationData({ state }, 'turn', null)
assert.equal(location.kind, 'turn')
assert.equal(location.turn, 7)
assert.equal(location.key, 'taskBoard')
assert.equal(location.value.proposals[0].callId, 'call-a')
assert.equal(location.value.proposals[0].title, '写周报')
assert.equal(definition.buildLocationData({ state }, 'step', null), null)
assert.equal(definition.buildLocationData({ state }, 'turn', location), location, 'unchanged turns keep the value')

/* ── the card itself ───────────────────────────────────────────────────── */

const face = tail.config.inject()
assert.equal(typeof face.createFromCard, 'function')
assert.equal(typeof face.openBoard, 'function')
assert.equal(typeof face.t, 'function')

const requests = []
globalThis.fetch = async (path, init) => {
  requests.push({ path, init })
  const body = JSON.parse(init.body)
  return {
    ok: true,
    status: 201,
    async json() {
      return {
        created: { id: 'created-1', title: body.title, status: 'todo', priority: body.priority, due: body.due ?? null, parentId: body.parentId ?? null },
        tasks: [{ id: 'created-1', title: body.title, status: 'todo', priority: body.priority, due: body.due ?? null, parentId: body.parentId ?? null }],
      }
    },
  }
}

/** Walk a rendered tree. */
function walk(node, visit) {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  visit(node)
  if (Array.isArray(node.children)) for (const child of node.children) walk(child, visit)
}

/** Collect every element carrying one class. */
function byClass(tree, className) {
  const found = []
  walk(tree, node => {
    if (node.tag === undefined || node.props === undefined) return
    const classes = typeof node.props.className === 'string' ? node.props.className.split(/\s+/) : []
    if (classes.includes(className)) found.push(node)
  })
  return found
}

/** Flatten the text of a node. */
function textOf(node) {
  if (node === null || node === undefined) return ''
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node.text !== undefined) return node.text
  return (node.children || []).map(textOf).join('')
}

/** A board store the card can subscribe to, without touching the real one. */
function createBoardStore(tasks) {
  let state = { tasks, loadedAt: Date.now(), error: null, busy: false }
  const listeners = new Set()
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(patch) {
      state = Object.assign({}, state, patch)
      for (const listener of Array.from(listeners)) listener()
    },
  }
}

const boardTasks = [
  { id: 'task-1', title: '任务面板', parentId: null, status: 'todo', priority: 'medium', due: null, note: '', updatedAt: 1 },
  { id: 'task-2', title: '子项', parentId: 'task-1', status: 'todo', priority: 'medium', due: null, note: '', updatedAt: 2 },
]

const baseProps = {
  ...face,
  store: createBoardStore(boardTasks),
  load: () => Promise.resolve(),
  sessionId: 'session-1',
  readSessions: () => [{ id: 'session-1', title: '测试对话' }],
}
const proposals = { proposals: location.value.proposals }
const tailProps = {
  ...baseProps,
  turn: { data: { get: key => (key === 'taskBoard' ? proposals : undefined) } },
}

/** The parent field trigger of one rendered card. */
function parentTrigger(tree) {
  return byClass(tree, 'tsk-card-parent-trigger')[0]
}

/** The rows of an open parent picker. */
function pickerRows(tree) {
  return byClass(tree, 'tsk-picker-row')
}

const first = mount(tail.Component, tailProps)
assert.equal(textOf(first.tree).includes('Nothing is written until you confirm'), true)
assert.equal(textOf(first.tree).includes('Session responsible · 测试对话'), true,
  'the card must name the conversation it will join')
assert.equal(byClass(first.tree, 'tsk-card').length, 1, 'one proposal renders one card')
const titleInput = byClass(first.tree, 'tsk-card-input')[0]
assert.equal(titleInput.props.value, '写周报')
assert.equal(byClass(first.tree, 'tsk-card-select')[0].props.value, 'high')
assert.equal(byClass(first.tree, 'tsk-card-date')[0].props.value, '2026-11-20')
assert.equal(byClass(first.tree, 'tsk-card-textarea')[0].props.value, '周五前提交')
assert.equal(byClass(first.tree, 'is-primary')[0].props.disabled, false)

// The parent picker is a tree list like the panel's move picker.
assert.equal(textOf(parentTrigger(first.tree)), 'Top level (no parent)', 'no parent is proposed')
assert.equal(pickerRows(first.tree).length, 0, 'the picker starts collapsed')
parentTrigger(first.tree).props.onClick()
assert.equal(pickerRows(first.tree).length, 3, 'top level plus both tasks')
assert.equal(textOf(pickerRows(first.tree)[0]), 'Top level (no parent)')
assert.equal(byClass(first.tree, 'is-selected').length, 1, 'the current choice is marked')
assert.equal(pickerRows(first.tree)[2].props.style.paddingLeft, '15px', 'a subtask is indented')

// Picking a row closes the picker and updates the field.
pickerRows(first.tree).find(row => textOf(row) === '任务面板').props.onClick()
assert.equal(pickerRows(first.tree).length, 0, 'picking closes the picker')
assert.equal(textOf(parentTrigger(first.tree)), '任务面板')

// The search box narrows the tree.
parentTrigger(first.tree).props.onClick()
assert.equal(pickerRows(first.tree).length, 3)
byClass(first.tree, 'tsk-input')[0].props.onChange({ target: { value: '子' } })
assert.equal(pickerRows(first.tree).length, 2, 'the search keeps the top row and one match')
assert.equal(textOf(pickerRows(first.tree)[1]), '子项')
parentTrigger(first.tree).props.onClick()

// The user edits the title, then confirms with the chosen parent.
titleInput.props.onChange({ target: { value: '写周报（改）' } })
assert.equal(byClass(first.tree, 'tsk-card-input')[0].props.value, '写周报（改）')
byClass(first.tree, 'is-primary')[0].props.onClick()
await new Promise(resolve => setTimeout(resolve, 0))

assert.equal(requests.length, 1, 'the card must write exactly once')
assert.equal(requests[0].path, '/plugin/task-board/tasks')
assert.equal(requests[0].init.method, 'POST')
assert.equal(requests[0].init.headers['x-task-board'], '1')
assert.deepEqual(JSON.parse(requests[0].init.body), {
  title: '写周报（改）',
  priority: 'high',
  note: '周五前提交',
  due: '2026-11-20',
  assignees: ['session-1'],
  parentId: 'task-1',
})
assert.equal(textOf(first.tree).includes('Created'), true)
assert.equal(textOf(first.tree).includes('写周报（改）'), true)
assert.equal(textOf(first.tree).includes('测试对话'), true, 'the created card keeps showing the Session')
assert.equal(requests.length, 1)

/* ── a proposed parent is preselected, even when the board lost it ─────── */

const prefilled = mount(tail.Component, {
  ...baseProps,
  turn: {
    data: {
      get: key => (key === 'taskBoard'
        ? { proposals: [{ ...meta, callId: 'call-parent', parentId: 'task-2', parentTitle: '子项' }] }
        : undefined),
    },
  },
})
assert.equal(textOf(parentTrigger(prefilled.tree)), '子项', 'the proposed parent is shown')
parentTrigger(prefilled.tree).props.onClick()
const preselected = byClass(prefilled.tree, 'is-selected')
assert.equal(preselected.length, 1)
assert.equal(textOf(preselected[0]), '子项', 'the proposed parent row is marked')

const orphan = mount(tail.Component, {
  ...baseProps,
  store: createBoardStore([]),
  turn: {
    data: {
      get: key => (key === 'taskBoard'
        ? { proposals: [{ ...meta, callId: 'call-orphan', parentId: 'gone', parentTitle: '已删除父任务' }] }
        : undefined),
    },
  },
})
assert.equal(textOf(parentTrigger(orphan.tree)), '已删除父任务')
parentTrigger(orphan.tree).props.onClick()
assert.ok(pickerRows(orphan.tree).some(row => textOf(row) === '已删除父任务'),
  'a missing parent stays selectable instead of resetting')

/* ── a remount must not create the same task again ─────────────────────── */

const replay = mount(tail.Component, tailProps)
assert.equal(textOf(replay.tree).includes('Created'), true)
assert.equal(byClass(replay.tree, 'tsk-card-input').length, 0, 'a created card shows no form')
assert.equal(requests.length, 1, 'a remount must not send another POST')

/* ── cancel, multiple proposals and empty turns ────────────────────────── */

const canceledTurn = { data: { get: key => (key === 'taskBoard' ? { proposals: [{ ...meta, callId: 'call-cancel' }] } : undefined) } }
const canceledState = mount(tail.Component, { ...baseProps, turn: canceledTurn })
byClass(canceledState.tree, 'tsk-btn').find(node => textOf(node) === 'Cancel').props.onClick()
assert.equal(textOf(canceledState.tree).includes('nothing was created'), true)
assert.equal(requests.length, 1)

const twiceTurn = {
  data: {
    get: key => (key === 'taskBoard'
      ? { proposals: [{ ...meta, callId: 'call-x' }, { ...meta, title: '整理会议记录', callId: 'call-y' }] }
      : undefined),
  },
}
const twice = mount(tail.Component, { ...baseProps, turn: twiceTurn })
assert.equal(byClass(twice.tree, 'tsk-card').length, 2, 'one card per proposal')

const empty = mount(tail.Component, { ...baseProps, turn: { data: { get: () => undefined } } })
assert.equal(empty.tree, null, 'a turn without proposals contributes nothing')

/* ── without a Session the card assigns nothing ────────────────────────── */

const looseTurn = { data: { get: key => (key === 'taskBoard' ? { proposals: [{ ...meta, title: '无会话任务', callId: 'call-z' }] } : undefined) } }
const loose = mount(tail.Component, { ...baseProps, sessionId: '', readSessions: () => [], turn: looseTurn })
assert.equal(textOf(loose.tree).includes('Session responsible'), false)
byClass(loose.tree, 'is-primary')[0].props.onClick()
await new Promise(resolve => setTimeout(resolve, 0))
assert.equal(requests.length, 2)
assert.equal(Object.hasOwn(JSON.parse(requests[1].init.body), 'assignees'), false,
  'a card outside a Session must not invent an assignee')

console.log('registered slots:', registrations.map(entry => entry.config.name + ':' + (entry.config.key || entry.config.id)).join(', '))
console.log('posted:', requests[0].path, requests[0].init.method)
console.log('ok: the card folds per Turn, renders at the turn tail, and only the confirm writes')
