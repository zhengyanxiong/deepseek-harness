import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire('/home/bernie/workspace/repo/deepseek-harness/node_modules/.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom/package.json')
const { createElement } = require('react')
const { renderToString } = require('react-dom/server')

const code = readFileSync('/home/bernie/workspace/repo/deepseek-harness/workbench/lib/client.js', 'utf8')
let entry
new Function('window', code)({ __ModuleLoader__: { load: e => { entry = e } } })

const span = () => (props) => createElement('span', null, props?.children)
const button = (props) => createElement('button', { 'aria-label': props?.['aria-label'], disabled: props?.disabled || undefined }, props?.children)
// Every atom the bundle may import renders as a permissive stub; known
// interactive atoms get real shapes (tabs render their item labels).
const primitives = new Proxy({
  Button: button,
  Tag: span(),
  StateDot: () => null,
  SegmentedTabs: ({ items, value }) => createElement('div', null, ...(items ?? []).map(item => createElement('span', { key: item.value, 'data-selected': item.value === value ? 'true' : undefined }, item.label))),
  Input: () => null,
}, {
  get(target, prop) {
    if (prop in target) return target[prop]
    if (prop === '__esModule') return true
    return () => null
  },
})
const bundleRequire = (spec) => (spec === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : require(spec))
const mod = entry.factory(bundleRequire)

const calls = { register: [], selectPanel: [], catalog: 0 }
const state = { activePanelId: null, sessions: { ids: [], byId: {} } }

const ctx = {
  effect: (fn) => { const d = fn(); return () => { d?.() } },
  locale: { register: () => {}, bind: () => (key) => key },
  sessions: { list: { getSnapshot: () => state.sessions, subscribe: () => () => {} } },
  jobs: { watchRows: () => () => {}, state: { getSnapshot: () => ({ rows: {}, observed: {} }), subscribe: () => () => {} } },
  slots: {
    inject: (name, cb) => { if (name === 'main') calls.mainCb = cb },
    register: (opts, comp) => { calls.register.push([opts, comp]); return () => {} },
  },
  layout: { panelInfo: { getSnapshot: () => ({ activePanelId: state.activePanelId }) }, selectPanel: (id) => { calls.selectPanel.push(id) } },
  remote: { schedule: { catalog: () => { calls.catalog += 1; return Promise.resolve({ ok: true, value: [] }) } }, $on: () => () => {} },
  on: () => () => {},
}

mod.apply(ctx)
calls.mainCb()
if (JSON.stringify(calls.selectPanel) !== '["workbench"]') throw new Error('startup select failed')
const mainOpts = calls.register[calls.register.length - 1]?.[0]
const component = calls.register[calls.register.length - 1]?.[1]

// A populated snapshot exercising every card's row/tag/bar path.
const byId = {
  s1: {
    id: 's1',
    displayTitle: 'Session One',
    running: true,
    blank: false,
    projectionValues: {
      goal: { goal: { id: 'g1', revision: 1, objective: 'Build the workbench', phase: 'active', maxGoalRounds: 256 }, roundsStarted: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
      tokenUsage: { uncachedInputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheWriteTokens: 100 },
      contextPressure: { pressureTokens: 60000, projectedTokens: 60000, contextWindow: 100000 },
      subagentCatalog: [{ id: 'child1', createdAt: '2026-01-01T00:00:00Z', mode: 'continuable', label: 'Child agent' }],
      agentTeam: { members: [{ id: 'm1', name: 'Lead', role: 'lead', phase: 'active' }], tasks: [] },
    },
  },
}
const rows = {
  s1: [
    { id: 'j1', kind: 'subagent', label: 'Run task', status: 'running', progress: '50%' },
    { id: 'j2', kind: 'workflow', label: 'Pipeline', status: 'completed' },
  ],
}
const reminders = { records: [{ id: 'r1', kind: 'once', title: 'Follow up', prompt: 'p', scheduledAt: '2026-01-02T00:00:00Z', sessionId: 's1', status: 'active' }], status: 'ready' }

const props = {
  useSessions: (selector) => selector({ ids: ['s1'], byId, phase: 'ready', projectionsBySession: {} }),
  useJobs: (selector) => selector({ rows, observed: {} }),
  useReminders: (selector) => selector(reminders),
  useActivity: (selector) => selector({ events: [], status: 'live' }),
  useTrends: (selector) => selector({ last: null }),
  useWorkspaces: (selector) => selector({ items: [], phase: 'ready', archivedSessionIds: [] }),
  SessionProvider: ({ children }) => children,
  renderSlot: () => null,
  renderFactorySlot: () => null,
  actions: {
    openSession: () => {},
    connectWorkspaceSession: async () => ({ sessionId: 's1', release: () => {} }),
    acquireDrawerSession: () => ({ sessionId: 's1', release: () => {} }),
    pickWorkspaceDirectory: async () => ({ kind: 'cancelled' }),
    browseWorkspaceDirectory: async () => undefined,
    createWorkspaceDirectory: async () => undefined,
    adoptWorkspacePath: async () => undefined,
    stopJob: async () => true,
    primeSessionDraft: () => true,
  },
  t: (key) => key,
}
const html = renderToString(createElement(component, props)).replace(/<!-- -->/g, '')
const expect = [
  'subtitle',
  'tabs.command',
  'tabs.monitor',
  'spine.label',
  'spine.empty',
  'spine.more',
  'eyebrow.happening',
  'op.attention', 'op.continue', 'op.search',
  'ongoing.title',
  'reminders.today',
  'cmd.newSession',
  'cmd.runWorkflow',
  'cmd.addTodo',
  'cmd.setReminder',
  'cmd.gotoMonitor',
  'composer.workspace',
  'composer.workspacePlaceholder',
  'composer.newWorkspace',
  'strip.trend',
  'Session One', 'Run task',
  '60%',
]
// The right panel is collapsed by default: no operation surface, no drawer,
// no composer seat renders on load.
const absent = ['op.target', 'op.newTarget', 'composer.workspaceHint', 'composer.workspaceLoading']
const present = absent.filter(marker => html.includes(marker))
if (present.length > 0) { console.log('RIGHT PANEL LEAKED ON LOAD:', JSON.stringify(present)); process.exit(1) }
const missing = expect.filter(t => !html.includes(t))
if (missing.length > 0) { console.log('MISSING:', JSON.stringify(missing)); process.exit(1) }

// Pagination: eleven sessions at PAGE_SIZE_LARGE (10) → page 0 shows ten, a "1 / 2" pager, and the eleventh is hidden.
const bigById = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`s${i + 1}`, {
  id: `s${i + 1}`,
  displayTitle: `Session ${i + 1}`,
  running: false,
  blank: false,
}]))
const bigProps = {
  useSessions: (selector) => selector({ ids: Object.keys(bigById), byId: bigById, phase: 'ready', projectionsBySession: {} }),
  useJobs: (selector) => selector({ rows: {}, observed: {} }),
  useReminders: (selector) => selector({ records: [], status: 'ready' }),
  useActivity: (selector) => selector({ events: [], status: 'live' }),
  useTrends: (selector) => selector({ last: null }),
  useWorkspaces: (selector) => selector({ items: [], phase: 'ready', archivedSessionIds: [] }),
  SessionProvider: ({ children }) => children,
  renderSlot: () => null,
  renderFactorySlot: () => null,
  actions: {
    openSession: () => {},
    connectWorkspaceSession: async () => ({ sessionId: 's1', release: () => {} }),
    acquireDrawerSession: () => ({ sessionId: 's1', release: () => {} }),
    pickWorkspaceDirectory: async () => ({ kind: 'cancelled' }),
    browseWorkspaceDirectory: async () => undefined,
    createWorkspaceDirectory: async () => undefined,
    adoptWorkspacePath: async () => undefined,
    stopJob: async () => true,
    primeSessionDraft: () => true,
  },
  t: (key) => key,
}
const bigHtml = renderToString(createElement(component, bigProps)).replace(/<!-- -->/g, '')
const paginationChecks = [
  ['first page item', 'Session 1'],
  ['tenth page item', 'Session 10'],
  ['pager indicator', '1 / 2'],
  ['prev label', 'pager.prev'],
  ['next label', 'pager.next'],
]
for (const [label, needle] of paginationChecks) {
  if (!bigHtml.includes(needle)) { console.log('PAGINATION MISSING:', label, JSON.stringify(needle)); process.exit(1) }
}
if (bigHtml.includes('Session 11')) { console.log('PAGINATION BUG: eleventh item leaked onto page 0'); process.exit(1) }

// Monitor tab: direct SSR render with stubbed hooks (regression net for the
// cached-snapshot contract the tab's useSyncExternalStore bindings rely on).
if (typeof mod.MonitorTab !== 'function') { console.log('MonitorTab not exported from bundle'); process.exit(1) }
const fakeSeries = { input: [1, 2, 3], output: [1, 2, 3], ctx: [50, 60, 55], jobs: [1, 1, 2], last: null }
const monitorHtml = renderToString(createElement(mod.MonitorTab, {
  t: (key) => key,
  useActivity: (selector) => selector({ events: [{ id: 1, ts: 1, time: '14:32', kind: 'done', text: 'x', source: 'a' }], status: 'live' }),
  useTrends: (selector) => selector({ last: null }),
  trendsSampler: { getSnapshot: () => ({ last: null }), subscribe: () => () => {}, series: () => fakeSeries },
  workflowRows: [],
  goalRows: [],
  tokenRows: [],
}))
const monitorExpect = ['trends.title', 'stream.title', 'progress.title', '1h', '6h', '24h']
const monitorMissing = monitorExpect.filter(t => !monitorHtml.includes(t))
if (monitorMissing.length > 0) { console.log('MONITOR MISSING:', JSON.stringify(monitorMissing)); process.exit(1) }

console.log('inject face hooks:', JSON.stringify(Object.keys(mainOpts.inject().hooks)))
console.log('rendered markers:', expect.length - missing.length, '/', expect.length, '| html bytes:', html.length)
console.log('pagination: 10/11 visible, pager 1/2, 11th hidden | big html bytes:', bigHtml.length)
console.log('SMOKE OK: apply + populated render + pagination pass')
