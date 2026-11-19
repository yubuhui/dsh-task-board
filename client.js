/**
 * Browser half of the task board.
 *
 * The board lives in a right-sidebar pane, so the main area keeps the real
 * conversation: assignee lines open that Session there while the board stays
 * on the right. Everything else is the user's own bookkeeping — create tasks
 * and nested subtasks, move them, set status, priority, due date and a progress
 * note, assign Sessions, and create a Session for a task.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-task-board',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useState, useSyncExternalStore } = React

    const NS = 'task-board'
    /** Identity the pane body and chip title register under, and the tab type owns. */
    const TAB_ID = '@local/dsh-task-board/board'
    /** The right-sidebar page type this plugin owns. */
    const TAB_KIND = 'taskBoard'
    /** Route collection the Host half serves; each item is `/tasks/<id>`. */
    const ENDPOINT = '/plugin/task-board/tasks'
    /** Request header the Host half requires on every call. */
    const HEADERS = { 'x-task-board': '1', 'content-type': 'application/json' }
    /** Statuses in lifecycle order. */
    const STATUSES = ['todo', 'active', 'blocked', 'done']
    /** Priorities, highest first. */
    const PRIORITIES = ['high', 'medium', 'low']
    /** How long a loaded board counts as current when the pane remounts. */
    const STALE_MS = 10000
    /** Deepest visual indentation, so a deep subtree keeps a readable width. */
    const MAX_INDENT = 4
    /** Assignee lines a row may show before summarizing the rest. */
    const ASSIGNEE_LINES = 3
    /** localStorage key remembering the Workspace the last new Session used. */
    const LAST_WORKSPACE_KEY = 'task-board:new-session-workspace'
    /** Longest initial requirement the new-Session form accepts. */
    const PROMPT_LIMIT = 8000

    const DICT = {
      zh: {
        title: '任务面板',
        tab: '任务',
        subtitle: '你指派，你推进；会话只是负责执行',
        empty: '还没有任务',
        emptyHint: '在上面输入标题回车即可新建；点某条任务的 + 可以加子任务',
        loading: '正在读取任务…',
        error: '操作失败',
        retry: '重试',
        refresh: '刷新',
        filterAll: '全部',
        filterOpen: '未完成',
        filterDone: '已完成',
        search: '搜索标题或备注',
        add: '添加',
        newTask: '新建任务，回车提交',
        subtaskPlaceholder: '子任务标题，回车提交',
        status: '状态',
        statusTodo: '待办',
        statusActive: '进行中',
        statusBlocked: '受阻',
        statusDone: '已完成',
        priority: '优先级',
        priorityHigh: '高',
        priorityMedium: '中',
        priorityLow: '低',
        due: '截止',
        note: '进展备注',
        notePlaceholder: '写进展、卡点、下一步',
        assignees: '负责会话',
        assigneesNone: '未指派',
        unassign: '移除',
        pickSessions: '选择会话',
        newSession: '新建会话',
        newSessionBusy: '创建中…',
        newSessionHint: '先选工作区、写清要求；点「发送并新建」才会创建会话、指派给这个任务并在主区打开',
        newSessionWorkspace: '工作区',
        newSessionNoWorkspace: '还没有工作区，请先在左侧栏新建',
        newSessionLoadingWorkspaces: '正在读取工作区…',
        newSessionWorkspaceUnavailable: '当前界面读不到工作区',
        newSessionPrompt: '要求',
        newSessionPromptPlaceholder: '告诉这个会话要做什么',
        newSessionSend: '发送并新建',
        newSessionRetry: '重试发送',
        newSessionRetryHint: '会话已创建；重试会接着完成指派和发送，不会重复建会话',
        newSessionWorkspaceRequired: '先选一个工作区',
        newSessionPromptRequired: '先写要求再发送',
        newSessionSendFailed: '消息发送失败',
        noSessionService: '当前界面不支持新建会话',
        noSessions: '没有可指派的会话',
        searchSessions: '搜索会话',
        save: '保存',
        cancel: '取消',
        delete: '删除',
        confirmDelete: '确认删除',
        expand: '展开子任务',
        collapse: '收起子任务',
        markDone: '标记完成',
        markTodo: '改回待办',
        edit: '编辑',
        addSubtask: '加子任务',
        openSession: '打开',
        overdue: '已逾期',
        dueToday: '今天到期',
        updated: '更新于',
        tasksCount: '个任务',
        openCount: '未完成',
        saving: '保存中…',
        justNow: '刚刚',
        minutesAgo: '分钟前',
        hoursAgo: '小时前',
        daysAgo: '天前',
        removeSubtree: '将同时删除其子任务',
        noMatch: '没有符合条件的任务',
        noChannel: '当前界面读不到任务数据',
        move: '移动',
        moveTo: '移动到…',
        moveTop: '顶层（无父任务）',
        moveSearch: '搜索目标任务',
        noMoveTarget: '没有可移动的目标',
        collapseEdit: '收起编辑',
        expandEdit: '展开编辑',
        more: '还有',
        assigneeMore: '还有',
        taskCountSuffix: '个会话',
        busy: '处理中…',
        cardTitle: '新建待办',
        cardHint: '确认后才会写入右侧任务面板',
        cardFieldTitle: '标题',
        cardTitlePlaceholder: '待办标题，必填',
        cardParent: '父任务',
        cardParentTop: '顶层（无父任务）',
        cardParentSearch: '搜索任务',
        cardParentNone: '没有可选的任务',
        cardSession: '负责会话',
        cardSessionCurrent: '当前对话',
        cardCreate: '创建',
        cardCreating: '创建中…',
        cardCreated: '已创建',
        cardCreatedHint: '完成状态回右侧面板勾选，助手不能改',
        cardOpenBoard: '打开任务面板',
        cardCanceled: '已取消，没有创建任何待办。',
        cardTitleRequired: '先填标题再创建',
      },
      en: {
        title: 'Task board',
        tab: 'Tasks',
        subtitle: 'You assign and drive; a Session only executes',
        empty: 'No tasks yet',
        emptyHint: 'Type a title below and press Enter, or press + on a task to nest a subtask',
        loading: 'Reading tasks…',
        error: 'The change failed',
        retry: 'Retry',
        refresh: 'Refresh',
        filterAll: 'All',
        filterOpen: 'Open',
        filterDone: 'Done',
        search: 'Search titles and notes',
        add: 'Add',
        newTask: 'New task, Enter to add',
        subtaskPlaceholder: 'Subtask title, Enter to add',
        status: 'Status',
        statusTodo: 'Todo',
        statusActive: 'In progress',
        statusBlocked: 'Blocked',
        statusDone: 'Done',
        priority: 'Priority',
        priorityHigh: 'High',
        priorityMedium: 'Medium',
        priorityLow: 'Low',
        due: 'Due',
        note: 'Progress note',
        notePlaceholder: 'Progress, blockers, next step',
        assignees: 'Sessions responsible',
        assigneesNone: 'Unassigned',
        unassign: 'Remove',
        pickSessions: 'Sessions',
        newSession: 'New Session',
        newSessionBusy: 'Creating…',
        newSessionHint: 'Pick a workspace and write the requirement; Send creates the Session, assigns it and opens it',
        newSessionWorkspace: 'Workspace',
        newSessionNoWorkspace: 'No workspace yet — add one in the left sidebar first',
        newSessionLoadingWorkspaces: 'Reading workspaces…',
        newSessionWorkspaceUnavailable: 'This window cannot read workspaces',
        newSessionPrompt: 'Requirement',
        newSessionPromptPlaceholder: 'Tell this Session what to do',
        newSessionSend: 'Send and create',
        newSessionRetry: 'Retry send',
        newSessionRetryHint: 'The Session was created; retrying continues assignment and sending without creating another',
        newSessionWorkspaceRequired: 'Pick a workspace first',
        newSessionPromptRequired: 'Write the requirement first',
        newSessionSendFailed: 'Sending the message failed',
        noSessionService: 'This window cannot create a Session',
        noSessions: 'No Session to assign',
        searchSessions: 'Search Sessions',
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        confirmDelete: 'Delete now',
        expand: 'Expand subtasks',
        collapse: 'Collapse subtasks',
        markDone: 'Mark done',
        markTodo: 'Back to todo',
        edit: 'Edit',
        addSubtask: 'Add subtask',
        openSession: 'Open',
        overdue: 'Overdue',
        dueToday: 'Due today',
        updated: 'Updated',
        tasksCount: 'tasks',
        openCount: 'open',
        saving: 'Saving…',
        justNow: 'just now',
        minutesAgo: 'min ago',
        hoursAgo: 'h ago',
        daysAgo: 'd ago',
        removeSubtree: 'Its subtasks are removed too',
        noMatch: 'No task matches',
        noChannel: 'This window cannot read task data',
        move: 'Move',
        moveTo: 'Move under…',
        moveTop: 'Top level (no parent)',
        moveSearch: 'Search the target task',
        noMoveTarget: 'No other task to move under',
        collapseEdit: 'Collapse the editor',
        expandEdit: 'Open the editor',
        more: 'and',
        assigneeMore: 'and',
        taskCountSuffix: 'Sessions',
        busy: 'Working…',
        cardTitle: 'New task',
        cardHint: 'Nothing is written until you confirm',
        cardFieldTitle: 'Title',
        cardTitlePlaceholder: 'Task title, required',
        cardParent: 'Parent task',
        cardParentTop: 'Top level (no parent)',
        cardParentSearch: 'Search tasks',
        cardParentNone: 'No task to choose',
        cardSession: 'Session responsible',
        cardSessionCurrent: 'this conversation',
        cardCreate: 'Create',
        cardCreating: 'Creating…',
        cardCreated: 'Created',
        cardCreatedHint: 'Change its status in the board; the agent cannot',
        cardOpenBoard: 'Open the board',
        cardCanceled: 'Canceled — nothing was created.',
        cardTitleRequired: 'Add a title first',
      },
    }

    /**
     * Create one snapshot source shared by the pane and its entry button.
     * @param initial - first state.
     * @returns a subscribe/getSnapshot pair plus a merge setter.
     */
    function createStore(initial) {
      let state = initial
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

    /**
     * Read one error's message.
     * @param error - caught value.
     * @returns readable text.
     */
    function messageOf(error) {
      if (error && typeof error.message === 'string') return error.message
      return String(error)
    }

    /** localStorage prefix for the receipt one card writes after it created a task. */
    const CARD_RECEIPT_PREFIX = 'task-board:card:'

    /** Board snapshot a card falls back to when the shared store is unavailable. */
    const EMPTY_BOARD = { tasks: [], loadedAt: 0 }

    /** Subscription a card uses when the shared store is unavailable. */
    function noSubscribe() {
      return () => {}
    }

    /**
     * Read the receipt one card left after its task was created, so a remount
     * of the same tool call cannot offer to create it a second time.
     * @param key - storage key, or null when the call has no id.
     * @returns the created task identity, or null.
     */
    function readCardReceipt(key) {
      if (key === null) return null
      try {
        const raw = window.localStorage.getItem(key)
        if (raw === null) return null
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return null
        if (typeof parsed.id !== 'string' || typeof parsed.title !== 'string') return null
        return { id: parsed.id, title: parsed.title }
      } catch {
        // Storage can be unavailable or hold another format; the card just resets.
        return null
      }
    }

    /**
     * Remember that one card already created its task.
     * @param key - storage key, or null.
     * @param receipt - created task identity.
     */
    function writeCardReceipt(key, receipt) {
      if (key === null) return
      try {
        window.localStorage.setItem(key, JSON.stringify(receipt))
      } catch {
        // Without storage the card still disables its button after the click.
      }
    }

    /**
     * Read the prefill a propose tool call carries.
     * @param meta - persisted result metadata, when present.
     * @returns the editable draft.
     */
    function cardDraftOf(meta) {
      const source = meta !== null && typeof meta === 'object' ? meta : {}
      return {
        title: typeof source.title === 'string' ? source.title : '',
        priority: source.priority === 'high' || source.priority === 'low' ? source.priority : 'medium',
        due: typeof source.due === 'string' ? source.due : '',
        note: typeof source.note === 'string' ? source.note : '',
        parentId: typeof source.parentId === 'string' ? source.parentId : '',
        parentTitle: typeof source.parentTitle === 'string' ? source.parentTitle : '',
      }
    }

    /**
     * Resolve the title of the Session a card belongs to.
     * @param readSessions - Session reader from the injected face.
     * @param sessionId - Session the card was offered from.
     * @returns the title, or an empty string when it cannot be resolved.
     */
    function sessionTitleOf(readSessions, sessionId) {
      if (typeof readSessions !== 'function' || sessionId.length === 0) return ''
      try {
        const row = readSessions().find(candidate => candidate.id === sessionId)
        return row === undefined ? '' : row.title
      } catch {
        return ''
      }
    }

    /**
     * Label the parent a card currently points at.
     * @param draft - card draft.
     * @param parents - picker rows.
     * @param t - translator.
     * @returns the visible label.
     */
    function parentLabel(draft, parents, t) {
      if (draft.parentId.length === 0) return t('cardParentTop')
      if (draft.parentTitle.length > 0) return draft.parentTitle
      const row = parents.find(candidate => candidate.id === draft.parentId)
      return row === undefined ? draft.parentId : row.title
    }

    /** Wire name of the Host tool that offers a new-task card. */
    const PROPOSE_TOOL = 'task_board_propose'
    /** Turn-data key this plugin publishes for the end-of-turn card. */
    const PROPOSAL_KEY = 'taskBoard'

    /**
     * Fold this session's task-card proposals per Turn. The engine publishes the
     * value under `turn.data`, so the tail card survives reloads and replays and
     * appears after the assistant's closing message rather than at the tool call.
     */
    const proposalDefinition = {
      kind: PROPOSAL_KEY,
      match(event) {
        if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
        if (event.type === 'tool/call' && event.data.name === PROPOSE_TOOL) {
          return { id: String(event.data.turn), role: 'update' }
        }
        if (event.type === 'tool/result') return { id: String(event.data.turn), role: 'update' }
        return null
      },
      start(_context, match) {
        return { turn: match.event.data.turn, calls: new Set(), proposals: [] }
      },
      update(context, match) {
        const state = context.state
        if (match.event.type === 'tool/call') {
          const calls = new Set(state.calls)
          calls.add(String(match.event.data.callId))
          return Object.assign({}, state, { calls })
        }
        if (match.event.type !== 'tool/result') return state
        const message = match.event.data.message
        if (message === undefined || message === null || message.isError === true) return state
        const callId = message.source === undefined ? '' : String(message.source.callId)
        if (!state.calls.has(callId)) return state
        const meta = match.event.data.meta
        if (meta === null || typeof meta !== 'object') return state
        const proposal = {
          callId,
          title: typeof meta.title === 'string' ? meta.title : '',
          priority: typeof meta.priority === 'string' ? meta.priority : 'medium',
          due: typeof meta.due === 'string' ? meta.due : '',
          note: typeof meta.note === 'string' ? meta.note : '',
          parentId: typeof meta.parentId === 'string' ? meta.parentId : '',
          parentTitle: typeof meta.parentTitle === 'string' ? meta.parentTitle : '',
        }
        const known = state.proposals.findIndex(item => item.callId === callId)
        const proposals = state.proposals.slice()
        if (known >= 0) proposals[known] = proposal
        else proposals.push(proposal)
        return Object.assign({}, state, { proposals })
      },
      buildLocationData(context, scope, previous) {
        if (scope !== 'turn' || context.state === undefined) return null
        const state = context.state
        if (previous !== null && previous.kind === 'turn' && previous.turn === state.turn
          && previous.key === PROPOSAL_KEY && previous.value.proposals === state.proposals) {
          return previous
        }
        return { kind: 'turn', turn: state.turn, key: PROPOSAL_KEY, value: { proposals: state.proposals } }
      },
    }

    /**
     * Read today's local date as `YYYY-MM-DD`.
     * @returns the date key.
     */
    function todayKey() {
      const date = new Date()
      const pad = value => String(value).padStart(2, '0')
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    }

    /** Glyphs drawn inline; the host's icon package is not importable here. */
    function BoardGlyph({ size }) {
      const edge = size || 15
      return h('svg', {
        width: edge, height: edge, viewBox: '0 0 16 16', fill: 'none',
        'aria-hidden': true, focusable: 'false', style: { display: 'block' },
      }, [
        h('rect', { key: 'a', x: 2, y: 2.6, width: 12, height: 2, rx: 1, fill: 'currentColor', opacity: 0.45 }),
        h('rect', { key: 'b', x: 2, y: 7, width: 8.4, height: 2, rx: 1, fill: 'currentColor' }),
        h('rect', { key: 'c', x: 2, y: 11.4, width: 10.4, height: 2, rx: 1, fill: 'currentColor', opacity: 0.45 }),
      ])
    }

    function ChevronGlyph({ open }) {
      return h('svg', {
        width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none', 'aria-hidden': true,
        style: { display: 'block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms ease' },
      }, h('path', { d: 'M3.4 1.8L6.6 5l-3.2 3.2', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    function CheckGlyph() {
      return h('svg', {
        width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none',
        'aria-hidden': true, style: { display: 'block' },
      }, h('path', { d: 'M1.8 5.2l2.1 2.1L8.2 3', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    function PlusGlyph() {
      return h('svg', {
        width: 11, height: 11, viewBox: '0 0 12 12', fill: 'none',
        'aria-hidden': true, style: { display: 'block' },
      }, h('path', { d: 'M6 1.6v8.8M1.6 6h8.8', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }))
    }

    function RefreshGlyph() {
      return h('svg', {
        width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none',
        'aria-hidden': true, focusable: 'false', style: { display: 'block' },
      }, h('path', {
        d: 'M13 8a5 5 0 1 1-1.6-3.7M13 2.4V5.2h-2.8',
        stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
      }))
    }

    /** Theme-token styles; every color comes from the host palette. */
    const CSS = [
      '.tsk-pane{height:100%;overflow:auto;display:flex;flex-direction:column;gap:6px;padding:10px 10px 22px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:13px;}',
      '.tsk-head{display:flex;align-items:center;gap:6px;}',
      '.tsk-head-main{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0;}',
      '.tsk-title{font-size:14px;line-height:20px;font-weight:600;margin:0;}',
      '.tsk-sub{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);}',
      '.tsk-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.tsk-icon-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.tsk-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}',
      '.tsk-quick{display:flex;gap:6px;}',
      '.tsk-input{width:100%;height:26px;padding:0 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;}',
      '.tsk-input:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px;}',
      '.tsk-btn{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;}',
      '.tsk-btn:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.tsk-btn.is-primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-overlay);font-weight:600;}',
      '.tsk-btn.is-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);}',
      '.tsk-btn:disabled{opacity:.55;cursor:default;}',
      '.tsk-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}',
      '.tsk-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
      '.tsk-seg{display:inline-flex;padding:2px;border-radius:7px;background:var(--dsw-alias-bg-layer-2);}',
      '.tsk-seg button{padding:2px 8px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;}',
      '.tsk-seg button[aria-pressed="true"]{background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-weight:600;}',
      '.tsk-search{flex:1;min-width:70px;height:24px;padding:0 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;}',
      '.tsk-search:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px;}',
      '.tsk-body{display:flex;flex-direction:column;gap:1px;}',
      '.tsk-node{display:block;}',
      '.tsk-row{display:flex;align-items:center;gap:5px;min-height:28px;padding:2px 4px;border-radius:6px;}',
      '.tsk-row:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.tsk-row.is-editing{background:var(--dsw-alias-bg-layer-2);}',
      '.tsk-twist{flex:none;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.tsk-twist.is-empty{cursor:default;}',
      '.tsk-check{flex:none;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;padding:0;border:1.5px solid var(--dsw-alias-border-l2);border-radius:50%;background:transparent;color:var(--dsw-alias-bg-overlay);cursor:pointer;}',
      '.tsk-check.is-done{border-color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-state-success-primary);}',
      '.tsk-check:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}',
      '.tsk-label{flex:1;min-width:0;border:0;padding:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;}',
      '.tsk-row.is-done .tsk-label{color:var(--dsw-alias-label-secondary);text-decoration:line-through;}',
      '.tsk-chip{flex:none;padding:0 4px;border-radius:4px;font-size:10px;line-height:15px;white-space:nowrap;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);}',
      '.tsk-chip.is-active{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary);}',
      '.tsk-chip.is-blocked{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);}',
      '.tsk-chip.is-high{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);}',
      '.tsk-chip.is-low{opacity:.7;}',
      '.tsk-chip.is-overdue{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);}',
      '.tsk-chip.is-soon{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary);}',
      '.tsk-progress{flex:none;font-size:10px;color:var(--dsw-alias-label-secondary);}',
      '.tsk-actions{flex:none;display:flex;gap:1px;visibility:hidden;}',
      '.tsk-row:hover .tsk-actions,.tsk-row:focus-within .tsk-actions{visibility:visible;}',
      '.tsk-action{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 4px;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;cursor:pointer;}',
      '.tsk-action:hover{background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);}',
      '.tsk-action.is-danger{color:var(--dsw-alias-state-error-primary);}',
      '.tsk-assignee-lines{display:flex;flex-direction:column;gap:0;margin:0 0 3px;}',
      '.tsk-assignee-line{display:flex;align-items:center;gap:5px;width:100%;padding:1px 6px;border:0;border-radius:5px;background:transparent;font:inherit;font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);text-align:left;cursor:pointer;}',
      '.tsk-assignee-line:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.tsk-assignee-line:disabled{cursor:default;opacity:.65;}',
      '.tsk-assignee-dot{flex:none;width:4px;height:4px;border-radius:50%;background:var(--dsw-alias-brand-primary);}',
      '.tsk-assignee-dot.is-missing{background:var(--dsw-alias-state-idle-primary);}',
      '.tsk-assignee-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.tsk-assignee-more{padding:0 6px 1px;font-size:10px;color:var(--dsw-alias-label-secondary);}',
      '.tsk-editor{margin:2px 4px 6px;padding:9px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;gap:7px;}',
      '.tsk-editor-grid{display:flex;gap:6px;flex-wrap:wrap;}',
      '.tsk-field{display:flex;flex-direction:column;gap:2px;min-width:82px;}',
      '.tsk-field-label{font-size:10px;color:var(--dsw-alias-label-secondary);}',
      '.tsk-select,.tsk-date{height:24px;padding:0 5px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;}',
      '.tsk-textarea{width:100%;min-height:46px;padding:5px 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;resize:vertical;}',
      '.tsk-editor-actions{display:flex;justify-content:flex-end;gap:5px;}',
      '.tsk-assignees{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
      '.tsk-assignee-rows{display:flex;flex-direction:column;gap:3px;}',
      '.tsk-assignee-row{display:flex;align-items:center;gap:6px;width:100%;padding:3px 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-overlay);font-size:11.5px;}',
      '.tsk-assignee-empty{font-size:11px;color:var(--dsw-alias-label-secondary);}',
      '.tsk-picker{margin-top:3px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-overlay);max-height:220px;overflow-y:auto;padding:6px;}',
      '.tsk-picker-head{font-size:10px;color:var(--dsw-alias-label-secondary);padding:0 2px 5px;}',
      '.tsk-picker-foot{display:flex;justify-content:flex-end;padding-top:3px;}',
      '.tsk-newsession{margin-top:4px;padding:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-overlay);display:flex;flex-direction:column;gap:7px;}',
      '.tsk-newsession .tsk-select{width:100%;}',
      '.tsk-newsession .tsk-textarea{min-height:64px;}',
      '.tsk-workspace-path{font-size:10px;line-height:14px;color:var(--dsw-alias-label-secondary);word-break:break-all;}',
      '.tsk-newsession-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;}',
      '.tsk-picker-row{display:flex;align-items:center;gap:5px;width:100%;padding:3px 5px;border:0;border-radius:5px;background:transparent;text-align:left;font:inherit;font-size:11.5px;color:var(--dsw-alias-label-primary);cursor:pointer;}',
      '.tsk-picker-row:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.tsk-picker-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.tsk-state{padding:16px 10px;text-align:center;font-size:11.5px;color:var(--dsw-alias-label-secondary);}',
      '.tsk-state-title{font-size:12.5px;color:var(--dsw-alias-label-primary);margin-bottom:3px;}',
      '.tsk-state.is-error .tsk-state-title{color:var(--dsw-alias-state-error-primary);}',
      '.tsk-error{margin:0 0 4px;padding:5px 7px;border-radius:6px;font-size:11px;color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);}',
      '.tsk-foot{display:flex;align-items:center;justify-content:space-between;gap:6px;padding-top:2px;font-size:10.5px;color:var(--dsw-alias-label-secondary);}',
      '.tsk-link{padding:1px 3px;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:11px;cursor:pointer;}',
      '.tsk-link:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.tsk-link:disabled{opacity:.55;cursor:default;}',
      '.tsk-footer{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;cursor:pointer;}',
      '.tsk-footer:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.tsk-footer:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}',
      '.tsk-footer-icon{position:relative;display:inline-flex;align-items:center;}',
      '.tsk-count-badge{position:absolute;top:-3px;right:-5px;min-width:14px;padding:0 3px;border-radius:7px;font-size:10px;font-weight:600;line-height:14px;text-align:center;color:var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-bg-overlay);}',
      '.tsk-tail{display:flex;flex-direction:column;gap:8px;padding:4px 0;}',
      '.tsk-card{margin:4px 0;padding:11px 12px;max-width:560px;display:flex;flex-direction:column;gap:9px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12.5px;}',
      '.tsk-card-head{display:flex;flex-direction:column;gap:2px;}',
      '.tsk-card-title{font-size:13px;font-weight:600;line-height:18px;}',
      '.tsk-card-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);}',
      '.tsk-card-fields{display:flex;flex-direction:column;gap:7px;}',
      '.tsk-card-row{display:flex;gap:8px;flex-wrap:wrap;}',
      '.tsk-card-field{display:flex;flex-direction:column;gap:3px;flex:1;min-width:120px;}',
      '.tsk-card-label{font-size:10.5px;color:var(--dsw-alias-label-secondary);}',
      '.tsk-card-input,.tsk-card-select,.tsk-card-date{height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;}',
      '.tsk-card-textarea{min-height:52px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;resize:vertical;}',
      '.tsk-card-input:focus-visible,.tsk-card-select:focus-visible,.tsk-card-date:focus-visible,.tsk-card-textarea:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px;}',
      '.tsk-card-parent{font-size:11px;color:var(--dsw-alias-label-secondary);}',
      '.tsk-card-parent-trigger{display:flex;align-items:center;justify-content:flex-start;text-align:left;cursor:pointer;}',
      '.tsk-picker-row.is-selected{color:var(--dsw-alias-brand-primary);font-weight:600;}',
      '.tsk-card-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;}',
      '.tsk-card-actions .tsk-btn{height:28px;padding:0 12px;}',
      '.tsk-card-state{display:flex;flex-direction:column;gap:3px;}',
      '.tsk-card-state-title{font-size:12.5px;font-weight:600;}',
      '.tsk-card-state-title.is-created{color:var(--dsw-alias-state-success-primary);}',
      '.tsk-card-detail{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word;}',
    ].join('')

    return {
      inject: ['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace', 'sidebarRightTabs', 'sidebarRight', 'layout', 'uiConversation'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT), 'task-board: dictionaries')
        ctx.effect(() => {
          if (typeof document === 'undefined' || document.head === null) return () => {}
          const element = document.createElement('style')
          element.setAttribute('data-dsh-plugin', 'task-board')
          element.textContent = CSS
          document.head.appendChild(element)
          return () => { element.remove() }
        }, 'task-board: styles')

        const translate = ctx.locale.bind(NS)
        const t = (key) => {
          try {
            const value = translate(key)
            if (typeof value === 'string' && value.length > 0) return value
          } catch {
            // A missing namespace still falls back to the built-in copy.
          }
          return DICT.en[key] !== undefined ? DICT.en[key] : key
        }

        const store = createStore({
          status: 'idle',
          error: null,
          tasks: [],
          loadedAt: 0,
          filter: 'open',
          query: '',
          collapsed: [],
          editingId: null,
          editing: null,
          pickerId: null,
          pickerQuery: '',
          moveId: null,
          moveQuery: '',
          confirmId: null,
          newTitle: '',
          draftParentId: null,
          draftTitle: '',
          busy: false,
          creating: false,
          newSessionFor: null,
          newSessionWorkspace: '',
          newSessionPrompt: '',
          newSessionCreated: null,
          newSessionError: null,
        })

        /** The Session list the assignee picker offers. */
        const sessionsSource = ctx.sessions && ctx.sessions.list ? ctx.sessions.list : undefined
        /** The Workspace list the new-Session form offers. */
        const workspacesSource = ctx.workspaces && ctx.workspaces.list ? ctx.workspaces.list : undefined

        /**
         * Read the Sessions a task may be assigned to.
         * @returns newest first, without subagent or blank rows.
         */
        function readSessions() {
          try {
            const snapshot = sessionsSource === undefined ? undefined : sessionsSource.getSnapshot()
            if (snapshot === undefined || snapshot === null) return []
            const rows = []
            for (const id of Object.keys(snapshot.byId || {})) {
              const row = snapshot.byId[id]
              if (row === undefined || row === null) continue
              if (row.origin === 'subagent' || row.blank === true) continue
              rows.push({
                id,
                title: typeof row.displayTitle === 'string' && row.displayTitle.length > 0
                  ? row.displayTitle
                  : (typeof row.title === 'string' && row.title.length > 0 ? row.title : id),
                cwd: typeof row.cwd === 'string' && row.cwd.length > 0 ? row.cwd : undefined,
                updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
              })
            }
            rows.sort((left, right) => right.updatedAt - left.updatedAt)
            return rows.slice(0, 80)
          } catch {
            return []
          }
        }

        /**
         * Keep the last two path segments, so Workspace rows that share a title
         * still read apart inside the narrow select.
         * @param path - absolute directory path.
         * @returns the short suffix.
         */
        function pathTail(path) {
          if (typeof path !== 'string' || path.length === 0) return ''
          const parts = path.split(/[\\/]+/).filter(Boolean)
          if (parts.length === 0) return path
          return parts.slice(-2).join('/')
        }

        /**
         * Read the Workspaces a new Session may join.
         * @returns rows plus the list lifecycle.
         */
        function readWorkspaces() {
          try {
            const snapshot = workspacesSource === undefined ? undefined : workspacesSource.getSnapshot()
            if (workspacesSource === undefined) return { rows: [], phase: 'unavailable' }
            if (snapshot === undefined || snapshot === null || !Array.isArray(snapshot.items)) {
              return { rows: [], phase: 'pending' }
            }
            const rows = []
            for (const item of snapshot.items) {
              if (item === null || typeof item !== 'object') continue
              if (typeof item.workspaceId !== 'string' || item.workspaceId.length === 0) continue
              const path = typeof item.path === 'string' ? item.path : ''
              const title = typeof item.title === 'string' && item.title.length > 0 ? item.title : pathTail(path)
              rows.push({
                id: item.workspaceId,
                title: title.length > 0 ? title : item.workspaceId,
                path,
                sessionIds: Array.isArray(item.sessionIds) ? item.sessionIds : [],
              })
            }
            return { rows, phase: snapshot.phase === 'ready' ? 'ready' : 'loading' }
          } catch {
            return { rows: [], phase: 'error' }
          }
        }

        /**
         * Read the Workspace the last new Session used.
         * @returns its id, or an empty string.
         */
        function readLastWorkspace() {
          try {
            const value = window.localStorage.getItem(LAST_WORKSPACE_KEY)
            return typeof value === 'string' ? value : ''
          } catch {
            return ''
          }
        }

        /**
         * Remember the Workspace a new Session used.
         * @param workspaceId - chosen Workspace.
         */
        function writeLastWorkspace(workspaceId) {
          try {
            window.localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId)
          } catch {
            // Without storage the form still preselects from the Session list.
          }
        }

        /**
         * Choose the Workspace a task's new Session should start in: the
         * Workspace of an existing assignee, the last Workspace used, the
         * Workspace of the newest Session, then the first listed.
         * @param taskId - task the Session is for.
         * @param rows - Workspace rows.
         * @returns a Workspace id, or an empty string when none exists.
         */
        function preferredWorkspaceId(taskId, rows) {
          if (rows.length === 0) return ''
          const current = store.getSnapshot()
          const task = current.tasks.find(row => row.id === taskId)
          const sessions = readSessions()
          if (task !== undefined && Array.isArray(task.assignees)) {
            for (const id of task.assignees) {
              // Workspace membership is authoritative and survives Session rows
              // whose cwd has not been refreshed yet.
              const owner = rows.find(row => row.sessionIds.includes(id))
              if (owner !== undefined) return owner.id
              const session = sessions.find(row => row.id === id)
              if (session === undefined || session.cwd === undefined) continue
              const match = rows.find(row => row.path === session.cwd)
              if (match !== undefined) return match.id
            }
          }
          const last = readLastWorkspace()
          if (rows.some(row => row.id === last)) return last
          const newest = sessions.find(row => row.cwd !== undefined)
          if (newest !== undefined) {
            const match = rows.find(row => row.path === newest.cwd)
            if (match !== undefined) return match.id
          }
          return rows[0].id
        }

        /**
         * Resolve the Workspace the form should use: the stored choice while it
         * still exists, otherwise the task's preferred Workspace.
         * @param taskId - task the Session is for.
         * @param rows - Workspace rows.
         * @param stored - Workspace id held by the form.
         * @returns the effective Workspace id.
         */
        function effectiveWorkspaceId(taskId, rows, stored) {
          if (rows.some(row => row.id === stored)) return stored
          return preferredWorkspaceId(taskId, rows)
        }

        /**
         * Call one route of this plugin and return its JSON payload.
         * @param path - absolute route path.
         * @param method - HTTP method.
         * @param body - JSON body, omitted for reads and deletes.
         * @returns the parsed payload.
         */
        async function call(path, method, body) {
          if (typeof fetch !== 'function') throw new Error(t('noChannel'))
          const init = { method, headers: HEADERS, cache: 'no-store' }
          if (body !== undefined) init.body = JSON.stringify(body)
          const response = await fetch(path, init)
          let payload = {}
          try {
            payload = await response.json()
          } catch {
            payload = {}
          }
          if (!response.ok) throw new Error(payload.error || ('HTTP ' + response.status))
          return payload
        }

        /**
         * Run one mutation with the busy flag and a surfaced failure.
         * @param operation - work that talks to the Host.
         */
        async function mutate(operation) {
          if (store.getSnapshot().busy) return
          store.set({ busy: true, error: null })
          try {
            await operation()
          } catch (error) {
            store.set({ error: messageOf(error) })
          } finally {
            store.set({ busy: false })
          }
        }

        /** Read the whole board from the Host. */
        async function load() {
          const current = store.getSnapshot()
          store.set({ status: current.tasks.length === 0 ? 'loading' : 'ready', error: null })
          try {
            const payload = await call(ENDPOINT, 'GET')
            store.set({
              status: 'ready',
              tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
              loadedAt: Date.now(),
              error: null,
            })
          } catch (error) {
            const before = store.getSnapshot()
            store.set({
              status: before.tasks.length === 0 ? 'error' : 'ready',
              error: messageOf(error),
              loadedAt: Date.now(),
            })
          }
        }

        /**
         * Create one task or subtask.
         * @param fields - submitted fields; `parentId` nests it.
         */
        async function create(fields) {
          await mutate(async () => {
            const payload = await call(ENDPOINT, 'POST', fields)
            store.set({ tasks: Array.isArray(payload.tasks) ? payload.tasks : [], loadedAt: Date.now() })
          })
        }

        /**
         * Create one task from a conversation card and refresh the shared board.
         * Kept out of `mutate` so the card can show the failure and retry.
         * @param fields - submitted task fields.
         * @returns the created task.
         */
        async function createFromCard(fields) {
          const payload = await call(ENDPOINT, 'POST', fields)
          store.set({
            tasks: Array.isArray(payload.tasks) ? payload.tasks : store.getSnapshot().tasks,
            loadedAt: Date.now(),
            error: null,
          })
          return payload.created
        }

        /**
         * Patch one task.
         * @param id - task to change.
         * @param patch - fields to change.
         */
        async function update(id, patch) {
          await mutate(async () => {
            const payload = await call(ENDPOINT + '/' + encodeURIComponent(id), 'PATCH', patch)
            store.set({ tasks: Array.isArray(payload.tasks) ? payload.tasks : [], loadedAt: Date.now() })
          })
        }

        /**
         * Delete one task and its subtree.
         * @param id - subtree root.
         */
        async function remove(id) {
          await mutate(async () => {
            const payload = await call(ENDPOINT + '/' + encodeURIComponent(id), 'DELETE')
            store.set({
              tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
              loadedAt: Date.now(),
              confirmId: null,
            })
          })
        }

        /**
         * Begin editing one task.
         * @param task - task to edit.
         */
        function startEdit(task) {
          store.set({
            moveId: null,
            editingId: task.id,
            pickerId: null,
            confirmId: null,
            newSessionFor: null,
            newSessionWorkspace: '',
            newSessionPrompt: '',
            newSessionCreated: null,
            newSessionError: null,
            editing: {
              id: task.id,
              title: task.title,
              status: task.status,
              priority: task.priority,
              due: task.due,
              note: task.note,
              assignees: Array.isArray(task.assignees) ? task.assignees.slice() : [],
            },
          })
        }

        /** Close the editor without saving. */
        function cancelEdit() {
          store.set({
            editingId: null,
            editing: null,
            pickerId: null,
            newSessionFor: null,
            newSessionWorkspace: '',
            newSessionPrompt: '',
            newSessionCreated: null,
            newSessionError: null,
          })
        }

        /**
         * Open the editor, or collapse it when that task is already open.
         * @param task - task whose editor toggles.
         */
        function toggleEdit(task) {
          if (store.getSnapshot().editingId === task.id) cancelEdit()
          else startEdit(task)
        }

        /**
         * Change the open editor form.
         * @param patch - fields to merge into the form.
         */
        function setForm(patch) {
          const current = store.getSnapshot().editing
          if (current === null) return
          store.set({ editing: Object.assign({}, current, patch) })
        }

        /** Save the open editor form. */
        async function saveEdit() {
          const form = store.getSnapshot().editing
          if (form === null) return
          await update(form.id, {
            title: form.title,
            status: form.status,
            priority: form.priority,
            due: form.due === '' ? null : form.due,
            note: form.note,
            assignees: form.assignees,
          })
          if (store.getSnapshot().error === null) {
            store.set({
              editingId: null,
              editing: null,
              pickerId: null,
              newSessionFor: null,
              newSessionWorkspace: '',
              newSessionPrompt: '',
              newSessionCreated: null,
              newSessionError: null,
            })
          }
        }

        /**
         * Mark one task done, or return it to todo.
         * @param task - task to toggle.
         */
        async function complete(task) {
          await update(task.id, { status: task.status === 'done' ? 'todo' : 'done' })
        }

        /**
         * Toggle one branch of the tree.
         * @param id - task whose children fold.
         */
        function toggleExpanded(id) {
          const current = store.getSnapshot().collapsed
          const next = current.indexOf(id) >= 0 ? current.filter(item => item !== id) : current.concat([id])
          store.set({ collapsed: next })
        }

        /**
         * Open the move picker of one task.
         * @param task - task to move.
         */
        function startMove(task) {
          const current = store.getSnapshot().moveId
          store.set({
            moveId: current === task.id ? null : task.id,
            moveQuery: '',
            editingId: null,
            editing: null,
            pickerId: null,
            confirmId: null,
            newSessionFor: null,
            newSessionWorkspace: '',
            newSessionPrompt: '',
            newSessionCreated: null,
            newSessionError: null,
          })
        }

        /** Close the move picker without moving anything. */
        function cancelMove() {
          store.set({ moveId: null, moveQuery: '' })
        }

        /**
         * Move one task under another task, or back to the top level.
         * @param taskId - task to move.
         * @param parentId - new parent, or null for the top level.
         */
        async function submitMove(taskId, parentId) {
          await update(taskId, { parentId })
          if (store.getSnapshot().error !== null) return
          const tasks = store.getSnapshot().tasks
          const byId = new Map(tasks.map(task => [task.id, task]))
          const reveal = new Set()
          let cursor = parentId
          while (cursor !== null && cursor !== undefined && !reveal.has(cursor)) {
            reveal.add(cursor)
            const parent = byId.get(cursor)
            cursor = parent === undefined ? undefined : parent.parentId
          }
          store.set({
            moveId: null,
            moveQuery: '',
            collapsed: store.getSnapshot().collapsed.filter(id => !reveal.has(id)),
          })
        }

        /**
         * Open the assignee picker for the task being edited.
         * @param id - task whose picker opens.
         */
        function togglePicker(id) {
          const current = store.getSnapshot().pickerId
          store.set({ pickerId: current === id ? null : id, pickerQuery: '' })
        }

        /**
         * Add or remove one Session from the open editor's assignees.
         * @param sessionId - Session to toggle.
         */
        function toggleAssignee(sessionId) {
          const form = store.getSnapshot().editing
          if (form === null) return
          const has = form.assignees.indexOf(sessionId) >= 0
          setForm({ assignees: has ? form.assignees.filter(item => item !== sessionId) : form.assignees.concat([sessionId]) })
        }

        /**
         * Begin a subtask under one task.
         * @param parentId - parent task id.
         */
        function startSubtask(parentId) {
          const collapsed = store.getSnapshot().collapsed
          store.set({
            draftParentId: parentId,
            draftTitle: '',
            moveId: null,
            editingId: null,
            editing: null,
            pickerId: null,
            confirmId: null,
            newSessionFor: null,
            newSessionWorkspace: '',
            newSessionPrompt: '',
            newSessionCreated: null,
            newSessionError: null,
            collapsed: collapsed.filter(id => id !== parentId),
          })
        }

        /** Create the subtask a draft row holds. */
        async function submitSubtask() {
          const current = store.getSnapshot()
          const title = current.draftTitle.trim()
          if (title.length === 0 || current.draftParentId === null) return
          await create({ title, parentId: current.draftParentId })
          if (store.getSnapshot().error === null) store.set({ draftParentId: null, draftTitle: '' })
        }

        /** Create a top-level task from the quick-add row. */
        async function submitNewTask() {
          const current = store.getSnapshot()
          const title = current.newTitle.trim()
          if (title.length === 0) return
          await create({ title })
          if (store.getSnapshot().error === null) store.set({ newTitle: '' })
        }

        /**
         * Open one assigned Session in the main area, where the real
         * conversation lives; the board stays on the right.
         * @param sessionId - Session to resume.
         */
        function openSession(sessionId) {
          try {
            ctx.uiWorkspace.openSession(sessionId)
          } catch (error) {
            console.error('[task-board] opening a Session failed:', error)
          }
        }

        /**
         * Read a business or transport failure for the pane.
         * @param error - caught value, or a Remote failure.
         * @returns readable text that keeps a stable code when one exists.
         */
        function failureText(error) {
          if (error !== null && typeof error === 'object') {
            const failure = error.rpcError !== undefined ? error.rpcError : error
            if (failure !== null && typeof failure === 'object') {
              const code = typeof failure.code === 'string' ? failure.code : ''
              const message = typeof failure.message === 'string' ? failure.message : ''
              if (code.length > 0 && message.length > 0) return code + ': ' + message
              if (message.length > 0) return message
            }
          }
          return messageOf(error)
        }

        /**
         * Open the new-Session form under the task being edited, or close it
         * when that task's form is already open.
         * @param taskId - task the new Session is for.
         */
        function startNewSession(taskId) {
          const current = store.getSnapshot()
          if (current.newSessionFor === taskId) {
            // The button toggles only an untouched form; typed text and a
            // created-but-unsent Session stay put until Cancel.
            if (current.newSessionPrompt.trim().length === 0 && current.newSessionCreated === null) cancelNewSession()
            return
          }
          const rows = readWorkspaces().rows
          store.set({
            newSessionFor: taskId,
            newSessionWorkspace: preferredWorkspaceId(taskId, rows),
            newSessionPrompt: '',
            newSessionCreated: null,
            newSessionError: null,
          })
        }

        /** Close the new-Session form without creating anything. */
        function cancelNewSession() {
          store.set({
            newSessionFor: null,
            newSessionWorkspace: '',
            newSessionPrompt: '',
            newSessionCreated: null,
            newSessionError: null,
          })
        }

        /**
         * Put one Session on a task without dropping the Sessions it already
         * has; the open editor form is kept in step so saving cannot remove it.
         * @param taskId - task that takes the Session.
         * @param sessionId - created Session.
         */
        async function assignSession(taskId, sessionId) {
          const current = store.getSnapshot()
          const storedTask = current.tasks.find(task => task.id === taskId)
          const fromStore = storedTask !== undefined && Array.isArray(storedTask.assignees) ? storedTask.assignees : []
          const form = current.editing
          // The open editor is the freshest view, including unsaved removals.
          const base = form !== null && form.id === taskId ? form.assignees : fromStore
          const assignees = Array.from(new Set([...base, sessionId]))
          const payload = await call(ENDPOINT + '/' + encodeURIComponent(taskId), 'PATCH', { assignees })
          store.set({
            tasks: Array.isArray(payload.tasks) ? payload.tasks : store.getSnapshot().tasks,
            loadedAt: Date.now(),
          })
          const next = store.getSnapshot().editing
          if (next !== null && next.id === taskId) setForm({ assignees })
        }

        /**
         * Send the first requirement into a Session.
         * @param sessionId - Session that receives the prompt.
         * @param text - requirement text, sent verbatim as one text block.
         * @returns when the Host accepted the prompt.
         */
        async function sendRequirement(sessionId, text) {
          const sessions = ctx.sessions
          if (sessions === undefined || typeof sessions.using !== 'function') {
            throw new Error(t('noSessionService'))
          }
          const result = await sessions.using(sessionId, { source: 'taskBoard' }, reference => (
            reference.binding.session.prompt([{ type: 'text', text }], 'queue')
          ))
          if (result === undefined || result.ok !== true) {
            const failure = result === undefined ? undefined : result.error
            throw new Error(failure === undefined ? t('newSessionSendFailed') : failureText(failure))
          }
        }

        /**
         * Create a Session in the chosen Workspace, assign it to the task, send
         * the requirement and open the conversation. A Session that was created
         * before a later step failed stays in the form so a retry reuses it.
         * @param taskId - task that takes the new Session.
         */
        async function submitNewSession(taskId) {
          const current = store.getSnapshot()
          if (current.creating) return
          const workspaceId = effectiveWorkspaceId(taskId, readWorkspaces().rows, current.newSessionWorkspace)
          const text = current.newSessionPrompt.trim()
          if (workspaceId.length === 0) {
            store.set({ newSessionError: t('newSessionWorkspaceRequired') })
            return
          }
          if (text.length === 0 && current.newSessionCreated === null) {
            store.set({ newSessionError: t('newSessionPromptRequired') })
            return
          }
          store.set({ creating: true, newSessionError: null })
          let sessionId = current.newSessionCreated
          try {
            if (sessionId === null) {
              const sessions = ctx.sessions
              if (sessions === undefined || typeof sessions.create !== 'function') {
                throw new Error(t('noSessionService'))
              }
              sessionId = await sessions.create({ workspaceId })
              store.set({ newSessionCreated: sessionId })
            }
            await assignSession(taskId, sessionId)
            if (text.length > 0) await sendRequirement(sessionId, text)
            writeLastWorkspace(workspaceId)
            store.set({
              creating: false,
              newSessionFor: null,
              newSessionWorkspace: '',
              newSessionPrompt: '',
              newSessionCreated: null,
              newSessionError: null,
            })
            openSession(sessionId)
          } catch (error) {
            store.set({ creating: false, newSessionError: failureText(error) })
          }
        }

        /**
         * Show the board pane in the right sidebar, making room for it when the
         * layout exposes that control.
         */
        function openBoard() {
          try {
            if (ctx.layout !== undefined && typeof ctx.layout.openRightbar === 'function') {
              ctx.layout.openRightbar(true, false)
            }
            ctx.sidebarRight.openTab(TAB_KIND)
          } catch (error) {
            console.error('[task-board] opening the board tab failed:', error)
          }
        }

        const face = () => ({
          store,
          t,
          load,
          create,
          createFromCard,
          update,
          remove,
          complete,
          startEdit,
          toggleEdit,
          cancelEdit,
          startMove,
          cancelMove,
          submitMove,
          setForm,
          saveEdit,
          toggleExpanded,
          togglePicker,
          toggleAssignee,
          startSubtask,
          submitSubtask,
          submitNewTask,
          openSession,
          startNewSession,
          cancelNewSession,
          submitNewSession,
          openBoard,
          readSessions,
          sessionsSource,
          readWorkspaces,
          workspacesSource,
        })

        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          priority: 'builtin',
          title: () => t('tab'),
        }), 'task-board: right-pane page type')

        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
          locale: NS,
          inject: face,
        }, BoardPane)), 'task-board: right-pane body')

        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: TAB_ID,
          locale: NS,
          inject: face,
        }, BoardTabTitle)), 'task-board: right-pane chip title')

        ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'task-board',
          order: 6,
          locale: NS,
          inject: face,
        }, OpenButton)), 'task-board: entry button')

        ctx.effect(() => ctx.uiConversation.events.register(proposalDefinition), 'task-board: proposal turn data')

        ctx.effect(() => ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: '@local/dsh-task-board',
          locale: NS,
          inject: face,
        }, ProposalTail)), 'task-board: end-of-turn cards')

        /**
         * Subscribe to the Session list when the shell exposes a source.
         * @returns the current assignable Sessions.
         */
        function useSessions(props) {
          const [rows, setRows] = useState(() => props.readSessions())
          useEffect(() => {
            const read = () => setRows(props.readSessions())
            read()
            const source = props.sessionsSource
            if (source === undefined || typeof source.subscribe !== 'function') return undefined
            const dispose = source.subscribe(read)
            return typeof dispose === 'function' ? dispose : undefined
          }, [])
          return rows
        }

        /**
         * Subscribe to the Workspace list when the shell exposes a source.
         * @returns the current Workspaces offered by the new-Session form.
         */
        function useWorkspaces(props) {
          const [snapshot, setSnapshot] = useState(() => props.readWorkspaces())
          useEffect(() => {
            const read = () => setSnapshot(props.readWorkspaces())
            read()
            const source = props.workspacesSource
            if (source === undefined || typeof source.subscribe !== 'function') return undefined
            const dispose = source.subscribe(read)
            return typeof dispose === 'function' ? dispose : undefined
          }, [])
          return snapshot
        }

        /**
         * Label one Workspace in the select: the title plus its distinguishing
         * path tail when the title itself does not carry the folder name.
         * @param row - Workspace row.
         * @returns the option text.
         */
        function workspaceOptionLabel(row) {
          const parts = row.path.split(/[\\/]+/).filter(Boolean)
          const last = parts.length === 0 ? '' : parts[parts.length - 1]
          if (last.length === 0 || row.title === last) return row.title
          return row.title + ' · ' + pathTail(row.path)
        }

        /**
         * Render the new-Session form under the editor: choose a Workspace, write
         * the requirement, then create on send.
         * @param props - pane props.
         * @param state - board state.
         * @param workspaces - Workspace rows and lifecycle.
         * @returns the form element.
         */
        function renderNewSession(props, state, workspaces) {
          const rows = workspaces.rows
          const created = state.newSessionCreated !== null
          const chosen = effectiveWorkspaceId(state.newSessionFor, rows, state.newSessionWorkspace)
          const selected = rows.find(row => row.id === chosen)
          const ready = rows.length > 0 && chosen.length > 0
          return h('div', { key: 'newSession', className: 'tsk-newsession' }, [
            h('div', { key: 'head', className: 'tsk-picker-head' }, props.t('newSessionHint')),
            h('div', { key: 'workspace', className: 'tsk-field' }, [
              h('span', { key: 'label', className: 'tsk-field-label' }, props.t('newSessionWorkspace')),
              h('select', {
                key: 'select',
                className: 'tsk-select',
                value: chosen,
                disabled: created || state.creating === true,
                'aria-label': props.t('newSessionWorkspace'),
                onChange: event => props.store.set({ newSessionWorkspace: event.target.value, newSessionError: null }),
              }, rows.length === 0
                ? [h('option', { key: 'none', value: '' },
                  props.t(workspaces.phase === 'ready'
                    ? 'newSessionNoWorkspace'
                    : (workspaces.phase === 'error' || workspaces.phase === 'unavailable'
                      ? 'newSessionWorkspaceUnavailable'
                      : 'newSessionLoadingWorkspaces')))]
                : rows.map(row => h('option', { key: row.id, value: row.id, title: row.path },
                  workspaceOptionLabel(row)))),
              selected !== undefined && selected.path.length > 0
                ? h('div', { key: 'path', className: 'tsk-workspace-path' }, selected.path)
                : null,
            ]),
            h('div', { key: 'prompt', className: 'tsk-field' }, [
              h('span', { key: 'label', className: 'tsk-field-label' }, props.t('newSessionPrompt')),
              h('textarea', {
                key: 'text',
                className: 'tsk-textarea',
                value: state.newSessionPrompt,
                maxLength: PROMPT_LIMIT,
                placeholder: props.t('newSessionPromptPlaceholder'),
                'aria-label': props.t('newSessionPrompt'),
                autoFocus: true,
                disabled: state.creating === true,
                onChange: event => props.store.set({ newSessionPrompt: event.target.value, newSessionError: null }),
              }),
            ]),
            created
              ? h('div', { key: 'retry', className: 'tsk-workspace-path' }, props.t('newSessionRetryHint'))
              : null,
            state.newSessionError !== null
              ? h('div', { key: 'error', className: 'tsk-error' }, String(state.newSessionError))
              : null,
            h('div', { key: 'actions', className: 'tsk-newsession-actions' }, [
              created
                ? h('button', {
                  key: 'open', type: 'button', className: 'tsk-link',
                  onClick: () => props.openSession(state.newSessionCreated),
                }, props.t('openSession'))
                : null,
              h('button', {
                key: 'cancel', type: 'button', className: 'tsk-btn',
                disabled: state.creating === true,
                onClick: props.cancelNewSession,
              }, props.t('cancel')),
              h('button', {
                key: 'send', type: 'button', className: 'tsk-btn is-primary',
                disabled: state.creating === true || !ready || state.newSessionPrompt.trim().length === 0,
                onClick: () => void props.submitNewSession(state.newSessionFor),
              }, state.creating === true
                ? props.t('newSessionBusy')
                : (created ? props.t('newSessionRetry') : props.t('newSessionSend'))),
            ]),
          ])
        }

        /**
         * Group tasks by parent and sort every sibling list.
         * @param tasks - all tasks.
         * @returns children by parent id, with `''` for roots.
         */
        function groupTasks(tasks) {
          const ids = new Set(tasks.map(task => task.id))
          const groups = new Map()
          for (const task of tasks) {
            const key = task.parentId !== null && ids.has(task.parentId) ? task.parentId : ''
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key).push(task)
          }
          const priorityRank = { high: 0, medium: 1, low: 2 }
          for (const list of groups.values()) {
            list.sort((left, right) => {
              const done = (left.status === 'done' ? 1 : 0) - (right.status === 'done' ? 1 : 0)
              if (done !== 0) return done
              const rank = (priorityRank[left.priority] ?? 1) - (priorityRank[right.priority] ?? 1)
              if (rank !== 0) return rank
              const dueLeft = left.due === null ? '9999-12-31' : left.due
              const dueRight = right.due === null ? '9999-12-31' : right.due
              if (dueLeft !== dueRight) return dueLeft < dueRight ? -1 : 1
              return right.updatedAt - left.updatedAt
            })
          }
          return { groups, ids }
        }

        /**
         * List every task as a selectable parent, parents before their children.
         * @param tasks - all tasks.
         * @returns rows with a title and a depth for indentation.
         */
        function parentChoices(tasks) {
          const { groups } = groupTasks(tasks)
          const rows = []
          const seen = new Set()
          const walk = (key, depth) => {
            const list = groups.get(key)
            if (list === undefined) return
            for (const task of list) {
              if (seen.has(task.id)) continue
              seen.add(task.id)
              rows.push({ id: task.id, title: task.title, depth })
              walk(task.id, depth + 1)
            }
          }
          walk('', 0)
          return rows
        }

        /**
         * Decide which tasks stay visible under the current filter and query.
         * @param tasks - all tasks.
         * @param state - board state.
         * @returns ids to render.
         */
        function visibleIds(tasks, state) {
          const { groups } = groupTasks(tasks)
          const parentOf = new Map(tasks.map(task => [task.id, task.parentId]))
          const query = state.query.trim().toLowerCase()
          const matches = (task) => {
            if (state.filter === 'open' && task.status === 'done') return false
            if (state.filter === 'done' && task.status !== 'done') return false
            if (query.length === 0) return true
            const haystack = (task.title + ' ' + (task.note || '')).toLowerCase()
            return haystack.indexOf(query) >= 0
          }
          const keep = new Set()
          const visit = (task) => {
            for (const child of groups.get(task.id) ?? []) visit(child)
            if (matches(task)) keep.add(task.id)
          }
          for (const root of groups.get('') ?? []) visit(root)
          for (const id of Array.from(keep)) {
            let parent = parentOf.get(id)
            while (parent !== null && parent !== undefined && !keep.has(parent)) {
              keep.add(parent)
              parent = parentOf.get(parent)
            }
          }
          return keep
        }

        /**
         * Count direct children and how many are done.
         * @param groups - children by parent id.
         * @param id - parent id.
         * @returns the counts.
         */
        function childCounts(groups, id) {
          const children = groups.get(id) ?? []
          let done = 0
          for (const child of children) if (child.status === 'done') done += 1
          return { total: children.length, done }
        }

        /**
         * List every task the given task may move under, in tree order.
         * @param groups - children by parent id.
         * @param taskId - task being moved.
         * @returns candidate rows with their nesting depth.
         */
        function moveCandidates(groups, taskId) {
          const blocked = new Set([taskId])
          const collect = (id) => {
            for (const child of groups.get(id) ?? []) {
              blocked.add(child.id)
              collect(child.id)
            }
          }
          collect(taskId)
          const rows = []
          const walk = (parentId, depth) => {
            for (const task of groups.get(parentId) ?? []) {
              if (blocked.has(task.id)) continue
              rows.push({ id: task.id, title: task.title, depth })
              walk(task.id, depth + 1)
            }
          }
          walk('', 0)
          return rows
        }

        /**
         * The "new task" card. The agent only prefills it; the click on 「创建」 is
         * what writes, so the assistant never claims a task exists by itself.
         * @param props - the folded proposal, card identity and injected face.
         * @returns the card.
         */
        function TaskCardView(props) {
          const meta = props.meta
          const sessionId = typeof props.sessionId === 'string' ? props.sessionId : ''
          const sessionTitle = typeof props.sessionTitle === 'string' ? props.sessionTitle : ''
          const receiptKey = typeof props.callId === 'string' && props.callId.length > 0
            ? CARD_RECEIPT_PREFIX + props.callId
            : null
          const [draft, setDraft] = useState(() => cardDraftOf(meta))
          const [created, setCreated] = useState(() => readCardReceipt(receiptKey))
          const [canceled, setCanceled] = useState(false)
          const [busy, setBusy] = useState(false)
          const [error, setError] = useState(null)
          const [picking, setPicking] = useState(false)
          const [parentQuery, setParentQuery] = useState('')
          const t = props.t
          const store = props.store === undefined || props.store === null ? null : props.store
          const board = useSyncExternalStore(
            store === null ? noSubscribe : store.subscribe,
            store === null ? () => EMPTY_BOARD : store.getSnapshot,
          )

          // The parent picker needs the current board; read it once when stale.
          useEffect(() => {
            if (store === null || typeof props.load !== 'function') return
            if (board.loadedAt === 0 || Date.now() - board.loadedAt > STALE_MS) void props.load()
          }, [])

          /**
           * Change one draft field.
           * @param patch - fields to merge into the draft.
           */
          function edit(patch) {
            setDraft(current => Object.assign({}, current, patch))
          }

          /**
           * Apply one parent choice and close the picker.
           * @param id - chosen parent id, or '' for the top level.
           * @param title - chosen parent title, or '' for the top level.
           */
          function pickParent(id, title) {
            edit({ parentId: id, parentTitle: title })
            setPicking(false)
            setParentQuery('')
          }

          /** Create the task the card describes. */
          async function submit() {
            if (busy) return
            const title = draft.title.trim()
            if (title.length === 0) {
              setError(t('cardTitleRequired'))
              return
            }
            if (typeof props.createFromCard !== 'function') {
              setError(t('noChannel'))
              return
            }
            setBusy(true)
            setError(null)
            try {
              const fields = { title, priority: draft.priority, note: draft.note }
              if (draft.due.length > 0) fields.due = draft.due
              if (draft.parentId.length > 0) fields.parentId = draft.parentId
              // The card belongs to this conversation, so the new task starts
              // assigned to the Session that offered it.
              if (sessionId.length > 0) fields.assignees = [sessionId]
              const task = await props.createFromCard(fields)
              const receipt = { id: task.id, title: task.title }
              writeCardReceipt(receiptKey, receipt)
              setCreated(receipt)
            } catch (failure) {
              setError(messageOf(failure))
            } finally {
              setBusy(false)
            }
          }

          const rows = []
          if (created !== null) {
            const details = [h('div', { key: 'detail', className: 'tsk-card-detail' }, t('cardCreatedHint'))]
            if (sessionId.length > 0) {
              details.push(h('div', { key: 'session', className: 'tsk-card-detail' },
                t('cardSession') + ' · ' + (sessionTitle.length > 0 ? sessionTitle : t('cardSessionCurrent'))))
            }
            rows.push(h('div', { key: 'state', className: 'tsk-card-state' }, [
              h('div', { key: 'title', className: 'tsk-card-state-title is-created' }, t('cardCreated') + ' · ' + created.title),
              ...details,
            ]))
            if (typeof props.openBoard === 'function') {
              rows.push(h('div', { key: 'actions', className: 'tsk-card-actions' },
                h('button', { type: 'button', className: 'tsk-btn', onClick: () => props.openBoard() }, t('cardOpenBoard'))))
            }
            return h('div', { className: 'tsk-card' }, rows)
          }
          if (canceled) {
            rows.push(h('div', { key: 'state', className: 'tsk-card-state' },
              h('div', { key: 'title', className: 'tsk-card-state-title' }, t('cardCanceled'))))
            return h('div', { className: 'tsk-card' }, rows)
          }

          // A proposed parent that the board no longer lists still appears, so
          // the card never silently drops back to the top level.
          const parents = parentChoices(board.tasks)
          if (draft.parentId.length > 0 && !parents.some(row => row.id === draft.parentId)) {
            parents.unshift({
              id: draft.parentId,
              title: draft.parentTitle.length > 0 ? draft.parentTitle : draft.parentId,
              depth: 0,
            })
          }
          const parentSearch = parentQuery.trim().toLowerCase()
          const pickable = parents.filter(row => parentSearch.length === 0 || row.title.toLowerCase().indexOf(parentSearch) >= 0)
          rows.push(h('div', { key: 'head', className: 'tsk-card-head' }, [
            h('div', { key: 'title', className: 'tsk-card-title' }, t('cardTitle')),
            h('div', { key: 'hint', className: 'tsk-card-hint' }, t('cardHint')),
          ]))
          rows.push(h('div', { key: 'fields', className: 'tsk-card-fields' }, [
            h('label', { key: 'title', className: 'tsk-card-field' }, [
              h('span', { key: 'label', className: 'tsk-card-label' }, t('cardFieldTitle')),
              h('input', {
                key: 'input',
                className: 'tsk-card-input',
                type: 'text',
                value: draft.title,
                placeholder: t('cardTitlePlaceholder'),
                'aria-label': t('cardTitlePlaceholder'),
                onChange: event => edit({ title: event.target.value }),
              }),
            ]),
            h('div', { key: 'row', className: 'tsk-card-row' }, [
              h('label', { key: 'priority', className: 'tsk-card-field' }, [
                h('span', { key: 'label', className: 'tsk-card-label' }, t('priority')),
                h('select', {
                  key: 'select',
                  className: 'tsk-card-select',
                  value: draft.priority,
                  onChange: event => edit({ priority: event.target.value }),
                }, PRIORITIES.map(priority => h('option', { key: priority, value: priority },
                  t('priority' + priority.charAt(0).toUpperCase() + priority.slice(1))))),
              ]),
              h('label', { key: 'due', className: 'tsk-card-field' }, [
                h('span', { key: 'label', className: 'tsk-card-label' }, t('due')),
                h('input', {
                  key: 'input',
                  className: 'tsk-card-date',
                  type: 'date',
                  value: draft.due,
                  onChange: event => edit({ due: event.target.value }),
                }),
              ]),
            ]),
            h('label', { key: 'note', className: 'tsk-card-field' }, [
              h('span', { key: 'label', className: 'tsk-card-label' }, t('note')),
              h('textarea', {
                key: 'input',
                className: 'tsk-card-textarea',
                value: draft.note,
                placeholder: t('notePlaceholder'),
                'aria-label': t('note'),
                onChange: event => edit({ note: event.target.value }),
              }),
            ]),
            h('div', { key: 'parent', className: 'tsk-card-field' }, [
              h('span', { key: 'label', className: 'tsk-card-label' }, t('cardParent')),
              h('button', {
                key: 'trigger',
                type: 'button',
                className: 'tsk-card-input tsk-card-parent-trigger',
                'aria-expanded': picking,
                'aria-label': t('cardParent'),
                onClick: () => setPicking(value => !value),
              }, h('span', { key: 'value' }, parentLabel(draft, parents, t))),
              picking === false ? null : h('div', { key: 'picker', className: 'tsk-picker' }, [
                h('input', {
                  key: 'search',
                  className: 'tsk-input',
                  value: parentQuery,
                  placeholder: t('cardParentSearch'),
                  'aria-label': t('cardParentSearch'),
                  onChange: event => setParentQuery(event.target.value),
                }),
                h('button', {
                  key: 'top',
                  type: 'button',
                  className: 'tsk-picker-row' + (draft.parentId.length === 0 ? ' is-selected' : ''),
                  onClick: () => pickParent('', ''),
                }, h('span', { key: 'title' }, t('cardParentTop'))),
                pickable.length === 0
                  ? h('div', { key: 'none', className: 'tsk-state' }, t('cardParentNone'))
                  : null,
                ...pickable.map(row => h('button', {
                  key: row.id,
                  type: 'button',
                  className: 'tsk-picker-row' + (draft.parentId === row.id ? ' is-selected' : ''),
                  style: { paddingLeft: (5 + Math.min(row.depth, MAX_INDENT) * 10) + 'px' },
                  onClick: () => pickParent(row.id, row.title),
                }, h('span', { key: 'title', title: row.title }, row.title))),
              ]),
            ]),
            sessionId.length === 0
              ? null
              : h('div', { key: 'session', className: 'tsk-card-parent' },
                t('cardSession') + ' · ' + (sessionTitle.length > 0 ? sessionTitle : t('cardSessionCurrent'))),
          ]))
          if (error !== null) rows.push(h('div', { key: 'error', className: 'tsk-error' }, error))
          rows.push(h('div', { key: 'actions', className: 'tsk-card-actions' }, [
            h('button', {
              key: 'cancel',
              type: 'button',
              className: 'tsk-btn',
              onClick: () => setCanceled(true),
            }, t('cancel')),
            h('button', {
              key: 'create',
              type: 'button',
              className: 'tsk-btn is-primary',
              disabled: busy || draft.title.trim().length === 0,
              onClick: () => { void submit() },
            }, busy ? t('cardCreating') : t('cardCreate')),
          ]))
          return h('div', { className: 'tsk-card' }, rows)
        }

        /**
         * The end of a Turn: one card per task the assistant offered there. The
         * cards sit after the closing message, so a confirmation looks like the
         * last thing in the conversation instead of a tool-call detail.
         * @param props - turn-tail owner props plus the injected face.
         * @returns the cards, or null when this Turn offered none.
         */
        function ProposalTail(props) {
          const turn = props.turn
          const sessionId = typeof props.sessionId === 'string' ? props.sessionId : ''
          const sessionTitle = sessionTitleOf(props.readSessions, sessionId)
          const data = turn === undefined || turn === null || turn.data === undefined
            || typeof turn.data.get !== 'function'
            ? undefined
            : turn.data.get(PROPOSAL_KEY)
          const proposals = data !== undefined && data !== null && Array.isArray(data.proposals)
            ? data.proposals
            : []
          if (proposals.length === 0) return null
          return h('div', { className: 'tsk-tail' }, proposals.map(proposal => h(TaskCardView, {
            key: proposal.callId,
            meta: proposal,
            callId: proposal.callId,
            sessionId,
            sessionTitle,
            t: props.t,
            store: props.store,
            load: props.load,
            createFromCard: props.createFromCard,
            openBoard: props.openBoard,
          })))
        }

        /**
         * The sidebar-foot button that reveals the board pane.
         * @param props - slot props plus the injected face.
         * @returns the button.
         */
        function OpenButton(props) {
          const state = useSyncExternalStore(props.store.subscribe, props.store.getSnapshot)
          const open = state.tasks.filter(task => task.status !== 'done').length
          const wide = props.wide === true
          return h('button', {
            type: 'button',
            className: 'tsk-footer',
            title: props.t('title'),
            'aria-label': props.t('title'),
            onClick: openBoard,
          }, [
            h('span', { key: 'icon', className: 'tsk-footer-icon' },
              h(BoardGlyph, { size: 15 }),
              open > 0 && !wide
                ? h('span', { key: 'badge', className: 'tsk-count-badge' }, open > 99 ? '99+' : String(open))
                : null),
            wide ? h('span', { key: 'label' }, props.t('title')) : null,
          ])
        }

        /**
         * The chip text of the board tab.
         * @param props - slot props plus the injected face.
         * @returns the title span.
         */
        function BoardTabTitle(props) {
          const state = useSyncExternalStore(props.store.subscribe, props.store.getSnapshot)
          const open = state.tasks.filter(task => task.status !== 'done').length
          return h('span', null, props.t('tab') + (open > 0 ? ' · ' + open : ''))
        }

        /**
         * The board pane shown in the right sidebar.
         * @param props - slot props plus the injected face.
         * @returns the pane.
         */
        function BoardPane(props) {
          const state = useSyncExternalStore(props.store.subscribe, props.store.getSnapshot)
          const sessions = useSessions(props)
          const workspaces = useWorkspaces(props)
          useEffect(() => {
            const current = props.store.getSnapshot()
            if (current.loadedAt === 0 || Date.now() - current.loadedAt > STALE_MS) void props.load()
          }, [])

          const now = Date.now()
          const { groups, ids } = groupTasks(state.tasks)
          const keep = visibleIds(state.tasks, state)
          const roots = (groups.get('') ?? []).filter(task => keep.has(task.id))
          const openCount = state.tasks.filter(task => task.status !== 'done').length

          return h('div', { className: 'tsk-pane' }, [
            h('div', { key: 'head', className: 'tsk-head' }, [
              h('div', { key: 'main', className: 'tsk-head-main' }, [
                h('h2', { key: 'title', className: 'tsk-title' }, props.t('title')),
                h('span', { key: 'sub', className: 'tsk-sub' },
                  props.t('openCount') + ' ' + openCount + ' / ' + state.tasks.length + ' ' + props.t('tasksCount')),
              ]),
              h('button', {
                key: 'refresh', type: 'button', className: 'tsk-icon-btn',
                title: props.t('refresh'), 'aria-label': props.t('refresh'),
                onClick: () => props.load(),
              }, h(RefreshGlyph)),
            ]),
            h('div', { key: 'quick', className: 'tsk-quick' }, [
              h('input', {
                key: 'input',
                className: 'tsk-input',
                value: state.newTitle,
                placeholder: props.t('newTask'),
                'aria-label': props.t('newTask'),
                onChange: event => props.store.set({ newTitle: event.target.value }),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') void props.submitNewTask()
                },
              }),
              h('button', {
                key: 'add', type: 'button', className: 'tsk-btn is-primary',
                disabled: state.newTitle.trim().length === 0 || state.busy,
                onClick: () => void props.submitNewTask(),
              }, props.t('add')),
            ]),
            h('div', { key: 'toolbar', className: 'tsk-toolbar' }, [
              h('div', { key: 'seg', className: 'tsk-seg' }, ['all', 'open', 'done'].map(filter => h('button', {
                key: filter,
                type: 'button',
                'aria-pressed': state.filter === filter,
                onClick: () => props.store.set({ filter }),
              }, props.t(filter === 'all' ? 'filterAll' : (filter === 'open' ? 'filterOpen' : 'filterDone'))))),
              h('input', {
                key: 'search',
                className: 'tsk-search',
                value: state.query,
                placeholder: props.t('search'),
                'aria-label': props.t('search'),
                onChange: event => props.store.set({ query: event.target.value }),
              }),
            ]),
            state.error !== null
              ? h('div', { key: 'error', className: 'tsk-error' }, String(state.error))
              : null,
            h('div', { key: 'body', className: 'tsk-body' }, [
              state.status === 'loading' && state.tasks.length === 0
                ? h('div', { key: 'loading', className: 'tsk-state' }, props.t('loading'))
                : null,
              state.status === 'error' && state.tasks.length === 0
                ? h('div', { key: 'failed', className: 'tsk-state is-error' }, [
                  h('div', { key: 'title', className: 'tsk-state-title' }, props.t('error')),
                  h('div', { key: 'detail' }, String(state.error || '')),
                  h('button', {
                    key: 'retry', type: 'button', className: 'tsk-link', onClick: () => props.load(),
                  }, props.t('retry')),
                ])
                : null,
              state.tasks.length === 0 && state.status === 'ready'
                ? h('div', { key: 'empty', className: 'tsk-state' }, [
                  h('div', { key: 'title', className: 'tsk-state-title' }, props.t('empty')),
                  h('div', { key: 'hint' }, props.t('emptyHint')),
                ])
                : null,
              roots.length === 0 && state.tasks.length > 0 && state.status === 'ready'
                ? h('div', { key: 'nomatch', className: 'tsk-state' }, props.t('noMatch'))
                : null,
              ...roots.map(task => renderNode(props, state, groups, ids, sessions, workspaces, task, 0, now)),
            ]),
            h('div', { key: 'foot', className: 'tsk-foot' }, [
              h('span', { key: 'counts' },
                state.tasks.length + ' ' + props.t('tasksCount')
                + (state.loadedAt > 0 ? ' · ' + props.t('updated') + ' ' + clock(state.loadedAt) : '')),
              state.busy
                ? h('span', { key: 'busy' }, props.t('saving'))
                : h('button', {
                  key: 'retry', type: 'button', className: 'tsk-link', onClick: () => props.load(),
                }, props.t('refresh')),
            ]),
          ])
        }

        /**
         * Render one task, its editor, its draft row and its subtree.
         * @param props - pane props.
         * @param state - board state.
         * @param groups - children by parent id.
         * @param ids - every task id.
         * @param sessions - assignable Sessions.
         * @param workspaces - Workspaces offered by the new-Session form.
         * @param task - task to render.
         * @param depth - nesting depth.
         * @param now - current time.
         * @returns the node element.
         */
        function renderNode(props, state, groups, ids, sessions, workspaces, task, depth, now) {
          const children = (groups.get(task.id) ?? []).filter(child => ids.has(child.id))
          const counts = childCounts(groups, task.id)
          const expanded = state.collapsed.indexOf(task.id) < 0
          const done = task.status === 'done'
          const editing = state.editingId === task.id
          const indentation = 2 + Math.min(depth, MAX_INDENT) * 10
          const visibleChildren = expanded
            ? children.map(child => renderNode(props, state, groups, ids, sessions, workspaces, child, depth + 1, now))
            : []

          return h('div', { key: task.id, className: 'tsk-node' }, [
            h('div', {
              key: 'row',
              className: 'tsk-row' + (done ? ' is-done' : '') + (editing ? ' is-editing' : ''),
              style: { paddingLeft: indentation + 'px' },
            }, [
              counts.total > 0
                ? h('button', {
                  key: 'twist', type: 'button', className: 'tsk-twist',
                  title: props.t(expanded ? 'collapse' : 'expand'),
                  'aria-label': props.t(expanded ? 'collapse' : 'expand'),
                  'aria-expanded': expanded,
                  onClick: () => props.toggleExpanded(task.id),
                }, h(ChevronGlyph, { open: expanded }))
                : h('span', { key: 'twist', className: 'tsk-twist is-empty' }),
              h('button', {
                key: 'check',
                type: 'button',
                className: 'tsk-check' + (done ? ' is-done' : ''),
                title: props.t(done ? 'markTodo' : 'markDone'),
                'aria-label': props.t(done ? 'markTodo' : 'markDone'),
                disabled: state.busy,
                onClick: () => void props.complete(task),
              }, done ? h(CheckGlyph) : null),
              h('button', {
                key: 'label', type: 'button', className: 'tsk-label',
                title: (task.note === '' ? task.title : (task.title + ' — ' + task.note))
                  + '\n' + props.t(editing ? 'collapseEdit' : 'expandEdit'),
                'aria-expanded': editing,
                onClick: () => props.toggleEdit(task),
              }, task.title),
              done ? null : statusChip(props, task.status),
              priorityChip(props, task.priority),
              dueChip(props, task, now),
              counts.total > 0
                ? h('span', { key: 'progress', className: 'tsk-progress' }, counts.done + '/' + counts.total)
                : null,
              h('div', { key: 'actions', className: 'tsk-actions' }, [
                h('button', {
                  key: 'add', type: 'button', className: 'tsk-action',
                  title: props.t('addSubtask'), 'aria-label': props.t('addSubtask'),
                  onClick: () => props.startSubtask(task.id),
                }, h(PlusGlyph)),
                h('button', {
                  key: 'move', type: 'button', className: 'tsk-action',
                  title: props.t('move'), 'aria-label': props.t('move'),
                  'aria-expanded': state.moveId === task.id,
                  onClick: () => props.startMove(task),
                }, props.t('move')),
                h('button', {
                  key: 'edit', type: 'button', className: 'tsk-action',
                  title: props.t('edit'), 'aria-label': props.t('edit'),
                  onClick: () => props.toggleEdit(task),
                }, props.t('edit')),
                state.confirmId === task.id
                  ? h('button', {
                    key: 'confirm', type: 'button', className: 'tsk-action is-danger',
                    disabled: state.busy,
                    onClick: () => void props.remove(task.id),
                  }, props.t('confirmDelete'))
                  : h('button', {
                    key: 'delete', type: 'button', className: 'tsk-action',
                    title: counts.total > 0 ? props.t('removeSubtree') : props.t('delete'),
                    'aria-label': props.t('delete'),
                    onClick: () => props.store.set({ confirmId: task.id }),
                  }, props.t('delete')),
              ]),
            ]),
            assigneeLines(props, task, sessions, indentation),
            editing && state.editing !== null ? renderEditor(props, state, sessions, workspaces) : null,
            state.moveId === task.id ? renderMovePicker(props, state, groups, task) : null,
            state.draftParentId === task.id
              ? h('div', { key: 'draft', className: 'tsk-quick', style: { paddingLeft: (indentation + 20) + 'px' } }, [
                h('input', {
                  key: 'input',
                  className: 'tsk-input',
                  value: state.draftTitle,
                  placeholder: props.t('subtaskPlaceholder'),
                  'aria-label': props.t('subtaskPlaceholder'),
                  onChange: event => props.store.set({ draftTitle: event.target.value }),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') void props.submitSubtask()
                    if (event.key === 'Escape') props.store.set({ draftParentId: null, draftTitle: '' })
                  },
                }),
                h('button', {
                  key: 'add', type: 'button', className: 'tsk-btn is-primary',
                  disabled: state.draftTitle.trim().length === 0 || state.busy,
                  onClick: () => void props.submitSubtask(),
                }, props.t('add')),
              ])
              : null,
            visibleChildren.length > 0 ? visibleChildren : null,
          ])
        }

        /**
         * Render the Sessions responsible for one task, one line each.
         * @param props - pane props.
         * @param task - task whose assignees render.
         * @param sessions - assignable Sessions, used to resolve titles.
         * @param indentation - left inset of the owning row.
         * @returns the list, or null when the task has no assignee.
         */
        function assigneeLines(props, task, sessions, indentation) {
          if (!Array.isArray(task.assignees) || task.assignees.length === 0) return null
          const rows = task.assignees.map((id) => {
            const found = sessions.find(session => session.id === id)
            return found === undefined ? { id, title: id, missing: true } : { id, title: found.title, missing: false }
          })
          const shown = rows.slice(0, ASSIGNEE_LINES)
          const hidden = rows.length - shown.length
          return h('div', {
            key: 'assignees',
            className: 'tsk-assignee-lines',
            style: { paddingLeft: (indentation + 20) + 'px' },
          }, [
            ...shown.map(row => h('button', {
              key: row.id,
              type: 'button',
              className: 'tsk-assignee-line',
              title: row.missing ? row.id : row.title,
              disabled: row.missing,
              onClick: () => props.openSession(row.id),
            }, [
              h('span', { key: 'dot', className: 'tsk-assignee-dot' + (row.missing ? ' is-missing' : '') }),
              h('span', { key: 'name', className: 'tsk-assignee-name' }, row.title),
            ])),
            hidden > 0
              ? h('span', { key: 'more', className: 'tsk-assignee-more' },
                props.t('assigneeMore') + ' ' + hidden + ' ' + props.t('taskCountSuffix'))
              : null,
          ])
        }

        /**
         * Render the editor of the task being edited.
         * @param props - pane props.
         * @param state - board state.
         * @param sessions - assignable Sessions.
         * @param workspaces - Workspaces offered by the new-Session form.
         * @returns the editor element.
         */
        function renderEditor(props, state, sessions, workspaces) {
          const form = state.editing
          const assigned = form.assignees.map((id) => {
            const found = sessions.find(session => session.id === id)
            return found === undefined ? { id, title: id, missing: true } : { id, title: found.title, missing: false }
          })
          return h('div', { key: 'editor', className: 'tsk-editor' }, [
            h('input', {
              key: 'title',
              className: 'tsk-input',
              value: form.title,
              placeholder: props.t('newTask'),
              'aria-label': props.t('newTask'),
              onChange: event => props.setForm({ title: event.target.value }),
            }),
            h('div', { key: 'grid', className: 'tsk-editor-grid' }, [
              field(props, 'status', h('select', {
                key: 'status', className: 'tsk-select', value: form.status,
                onChange: event => props.setForm({ status: event.target.value }),
              }, STATUSES.map(status => h('option', { key: status, value: status }, props.t('status' + status.charAt(0).toUpperCase() + status.slice(1)))))),
              field(props, 'priority', h('select', {
                key: 'priority', className: 'tsk-select', value: form.priority,
                onChange: event => props.setForm({ priority: event.target.value }),
              }, PRIORITIES.map(priority => h('option', { key: priority, value: priority }, props.t('priority' + priority.charAt(0).toUpperCase() + priority.slice(1)))))),
              field(props, 'due', h('input', {
                key: 'due', className: 'tsk-date', type: 'date', value: form.due === null ? '' : form.due,
                onChange: event => props.setForm({ due: event.target.value === '' ? null : event.target.value }),
              })),
            ]),
            h('div', { key: 'assignees', className: 'tsk-field' }, [
              h('span', { key: 'label', className: 'tsk-field-label' }, props.t('assignees')),
              h('div', { key: 'rows', className: 'tsk-assignee-rows' },
                assigned.length === 0
                  ? h('div', { key: 'none', className: 'tsk-assignee-empty' }, props.t('assigneesNone'))
                  : assigned.map(session => h('div', { key: session.id, className: 'tsk-assignee-row' }, [
                    h('span', {
                      key: 'dot',
                      className: 'tsk-assignee-dot' + (session.missing ? ' is-missing' : ''),
                    }),
                    h('span', {
                      key: 'title',
                      className: 'tsk-assignee-name',
                      title: session.missing ? session.id : session.title,
                    }, session.title),
                    session.missing
                      ? null
                      : h('button', {
                        key: 'open', type: 'button', className: 'tsk-link',
                        onClick: () => props.openSession(session.id),
                      }, props.t('openSession')),
                    h('button', {
                      key: 'remove', type: 'button', className: 'tsk-link',
                      onClick: () => props.toggleAssignee(session.id),
                    }, props.t('unassign')),
                  ]))),
              h('div', { key: 'pickRow', className: 'tsk-assignees' }, [
                h('button', {
                  key: 'pick', type: 'button', className: 'tsk-link',
                  onClick: () => props.togglePicker(form.id),
                }, props.t('pickSessions')),
                h('button', {
                  key: 'new', type: 'button', className: 'tsk-link',
                  title: props.t('newSessionHint'),
                  'aria-expanded': state.newSessionFor === form.id,
                  disabled: state.creating === true,
                  onClick: () => props.startNewSession(form.id),
                }, '+ ' + props.t('newSession')),
              ]),
              state.pickerId === form.id ? renderPicker(props, state, sessions, form) : null,
              state.newSessionFor === form.id ? renderNewSession(props, state, workspaces) : null,
            ]),
            h('textarea', {
              key: 'note',
              className: 'tsk-textarea',
              value: form.note,
              placeholder: props.t('notePlaceholder'),
              'aria-label': props.t('note'),
              onChange: event => props.setForm({ note: event.target.value }),
            }),
            h('div', { key: 'actions', className: 'tsk-editor-actions' }, [
              h('button', {
                key: 'cancel', type: 'button', className: 'tsk-btn', onClick: props.cancelEdit,
              }, props.t('cancel')),
              h('button', {
                key: 'save', type: 'button', className: 'tsk-btn is-primary',
                disabled: state.busy || form.title.trim().length === 0,
                onClick: () => void props.saveEdit(),
              }, props.t('save')),
            ]),
          ])
        }

        /**
         * Render the Session picker inside the editor.
         * @param props - pane props.
         * @param state - board state.
         * @param sessions - assignable Sessions.
         * @param form - open editor form.
         * @returns the picker element.
         */
        function renderPicker(props, state, sessions, form) {
          const query = state.pickerQuery.trim().toLowerCase()
          const rows = sessions.filter(session => query.length === 0 || session.title.toLowerCase().indexOf(query) >= 0)
          return h('div', { key: 'picker', className: 'tsk-picker' }, [
            h('input', {
              key: 'search',
              className: 'tsk-input',
              value: state.pickerQuery,
              placeholder: props.t('searchSessions'),
              'aria-label': props.t('searchSessions'),
              onChange: event => props.store.set({ pickerQuery: event.target.value }),
            }),
            rows.length === 0
              ? h('div', { key: 'none', className: 'tsk-state' }, props.t('noSessions'))
              : null,
            ...rows.map(session => h('label', { key: session.id, className: 'tsk-picker-row' }, [
              h('input', {
                key: 'box', type: 'checkbox',
                checked: form.assignees.indexOf(session.id) >= 0,
                onChange: () => props.toggleAssignee(session.id),
              }),
              h('span', { key: 'title', title: session.title }, session.title),
            ])),
          ])
        }

        /**
         * Render the move picker under one row.
         * @param props - pane props.
         * @param state - board state.
         * @param groups - children by parent id.
         * @param task - task being moved.
         * @returns the picker element.
         */
        function renderMovePicker(props, state, groups, task) {
          const query = state.moveQuery.trim().toLowerCase()
          const rows = moveCandidates(groups, task.id)
            .filter(row => query.length === 0 || row.title.toLowerCase().indexOf(query) >= 0)
          return h('div', { key: 'move', className: 'tsk-picker' }, [
            h('div', { key: 'head', className: 'tsk-picker-head' }, props.t('moveTo')),
            h('input', {
              key: 'search',
              className: 'tsk-input',
              value: state.moveQuery,
              placeholder: props.t('moveSearch'),
              'aria-label': props.t('moveSearch'),
              onChange: event => props.store.set({ moveQuery: event.target.value }),
            }),
            h('button', {
              key: 'top', type: 'button', className: 'tsk-picker-row',
              onClick: () => void props.submitMove(task.id, null),
            }, h('span', { key: 'title' }, props.t('moveTop'))),
            rows.length === 0
              ? h('div', { key: 'none', className: 'tsk-state' }, props.t('noMoveTarget'))
              : null,
            ...rows.map(row => h('button', {
              key: row.id,
              type: 'button',
              className: 'tsk-picker-row',
              style: { paddingLeft: (5 + Math.min(row.depth, MAX_INDENT) * 10) + 'px' },
              onClick: () => void props.submitMove(task.id, row.id),
            }, h('span', { key: 'title', title: row.title }, row.title))),
            h('div', { key: 'foot', className: 'tsk-picker-foot' }, h('button', {
              key: 'cancel', type: 'button', className: 'tsk-link', onClick: props.cancelMove,
            }, props.t('cancel'))),
          ])
        }

        /**
         * Label one editor control.
         * @param props - pane props.
         * @param key - dictionary key of the label.
         * @param control - the control element.
         * @returns the labelled field.
         */
        function field(props, key, control) {
          return h('div', { key: key, className: 'tsk-field' }, [
            h('span', { key: 'label', className: 'tsk-field-label' }, props.t(key)),
            control,
          ])
        }

        /**
         * Render the status chip of one row.
         * @returns the chip, or null for a todo task.
         */
        function statusChip(props, status) {
          if (status === 'todo') return null
          const label = props.t('status' + status.charAt(0).toUpperCase() + status.slice(1))
          return h('span', { key: 'status', className: 'tsk-chip' + (status === 'active' ? ' is-active' : ' is-blocked') }, label)
        }

        /**
         * Render the priority chip of one row; medium stays implicit.
         * @returns the chip or null.
         */
        function priorityChip(props, priority) {
          if (priority === 'medium') return null
          return h('span', { key: 'priority', className: 'tsk-chip' + (priority === 'high' ? ' is-high' : ' is-low') },
            props.t('priority' + priority.charAt(0).toUpperCase() + priority.slice(1)))
        }

        /**
         * Render the due chip of one row.
         * @returns the chip or null.
         */
        function dueChip(props, task, now) {
          if (task.due === null) return null
          const today = todayKey()
          const late = task.status !== 'done' && task.due < today
          const soon = task.status !== 'done' && task.due === today
          const suffix = late ? props.t('overdue') : (soon ? props.t('dueToday') : task.due)
          return h('span', {
            key: 'due',
            className: 'tsk-chip' + (late ? ' is-overdue' : (soon ? ' is-soon' : '')),
            title: props.t('due') + ' ' + task.due,
          }, suffix)
        }

        /**
         * Format one timestamp as a short clock.
         * @param epoch - point in time.
         * @returns `hh:mm`.
         */
        function clock(epoch) {
          const date = new Date(epoch)
          const pad = value => String(value).padStart(2, '0')
          return pad(date.getHours()) + ':' + pad(date.getMinutes())
        }
      },
    }
  },
})
