// @vitest-environment jsdom
import type { InputHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { JOB_STATUS_KEY, WorkbenchPanel } from '../src/client/WorkbenchPanel.tsx'
import type { WorkbenchPanelProps } from '../src/client/WorkbenchPanel.tsx'
import { zh } from '../src/client/locales.ts'
import type { JobRowContext } from '../src/client/shared/rows.ts'

// Use the real button so the click path includes the browser primitive.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async importOriginal => {
  const { Button } = await importOriginal<typeof import('@deepseek-ai/dsh-client-ui-primitives')>()
  // The palette attaches a ref; forwardRef keeps the console clean.
  const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
    (props, _ref) => <input {...props} />)
  const primitives = {
    Button,
    Input,
    Tag: ({ children }: { children: ReactNode }) => <span>{children}</span>,
    StateDot: () => null,
    Modal: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div role="dialog">{children}</div> : null,
    SegmentedTabs: ({ items, value, onChange, label }: {
      items: { value: string; label: string }[]; value: string; onChange(value: string): void; label: string
    }) => <div role="tablist" aria-label={label}>{items.map(item => <button key={item.value} role="tab"
      aria-selected={value === item.value} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>,
  }
  return new Proxy(primitives, {
    has(target, key) { return key in target || (typeof key === 'string' && key.startsWith('Icon')) },
    get(target, key) {
      if (key in target) return target[key as keyof typeof target]
      if (typeof key === 'string' && key.startsWith('Icon')) return () => null
      return undefined
    },
  })
})

const workspaceId = 'workspace-a' as WorkspaceId
const secondWorkspaceId = 'workspace-b' as WorkspaceId
const composerId = 'composer-session' as SessionId
const targetId = 'existing-session' as SessionId
const lateId = 'late-session' as SessionId
const actionNames = ['cmd.newSession', 'cmd.runWorkflow', 'cmd.addTodo', 'cmd.setReminder'] as const

function reference(sessionId: SessionId) {
  // The smoke SessionProvider only consumes ownership identity, not a live Session binding.
  return { sessionId, release: vi.fn() } as SessionReference & { release: ReturnType<typeof vi.fn> }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function fixture() {
  const composer = reference(composerId)
  const target = reference(targetId)
  const actions = {
    openSession: vi.fn(),
    connectWorkspaceSession: vi.fn(async (_id: WorkspaceId) => composer),
    acquireDrawerSession: vi.fn((id: SessionId) => id === targetId ? target : reference(id)),
    pickWorkspaceDirectory: vi.fn(async () => ({ kind: 'cancelled' as const })),
    browseWorkspaceDirectory: vi.fn(async () => undefined),
    createWorkspaceDirectory: vi.fn(async () => undefined),
    adoptWorkspacePath: vi.fn(async () => undefined),
    stopJob: vi.fn(async () => true),
    primeSessionDraft: vi.fn((_id: SessionId, _prompt?: string) => true),
  }
  const sessions = {
    ids: [composerId, targetId, lateId], phase: 'ready' as const, projectionsBySession: {},
    byId: Object.fromEntries([
      [composerId, '空白会话', true], [targetId, '会话 A', false], [lateId, '迟到会话', true],
    ].map(([id, title, blank]) => [id, {
      id, displayTitle: title, blank, running: false, cwd: '/project/a', updatedAt: 0, retainedBy: {},
    }])),
  }
  const jobs = { rows: {}, observed: {} }
  const reminders = { records: [], status: 'ready' as const }
  const activity = { events: [], status: 'live' as const }
  const trends = { last: null }
  const workspaces = { phase: 'ready' as const, archivedSessionIds: [], items: [
    { workspaceId, title: '工程 A', path: '/project/a' },
    { workspaceId: secondWorkspaceId, title: '工程 B', path: '/project/b' },
  ] }
  // Match smoke.mjs's injected snapshot hooks and scope seats; no business components are mocked.
  const props = {
    useSessions: (selector: (state: typeof sessions) => unknown) => selector(sessions),
    useJobs: (selector: (state: typeof jobs) => unknown) => selector(jobs),
    useReminders: (selector: (state: typeof reminders) => unknown) => selector(reminders),
    useActivity: (selector: (state: typeof activity) => unknown) => selector(activity),
    useTrends: (selector: (state: typeof trends) => unknown) => selector(trends),
    useWorkspaces: (selector: (state: typeof workspaces) => unknown) => selector(workspaces),
    SessionProvider: ({ children }: { children: ReactNode }) => children,
    renderSlot: () => <span>会话输入区</span>,
    renderFactorySlot: () => null,
    actions,
    t: (key: keyof typeof zh) => zh[key],
  } as WorkbenchPanelProps
  render(<WorkbenchPanel {...props} />)
  return { actions, composer }
}

function openAction(key: typeof actionNames[number]) {
  fireEvent.click(screen.getByRole('button', { name: zh[key], exact: true }))
  return screen.getByRole('complementary', { name: zh['op.target'] })
}

function selectWorkspace() {
  fireEvent.change(screen.getByRole('combobox', { name: zh['composer.workspace'] }), { target: { value: workspaceId } })
}

function submitContent(content = '准备测试请求') {
  fireEvent.change(screen.getByLabelText(zh['op.content']), { target: { value: content } })
  fireEvent.click(screen.getByRole('button', { name: zh['op.prepare'] }))
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); localStorage.clear() })

describe('WorkbenchPanel operation forms', () => {
  it('covers every job status with a declared locale key', () => {
    const statuses: JobRowContext['job']['status'][] = ['running', 'stopping', 'completed', 'killed', 'failed']
    for (const status of statuses) expect(zh[JOB_STATUS_KEY[status]]).toBeTruthy()
  })

  it('renders with the right panel collapsed by default', () => {
    fixture()
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText(zh['op.newTarget'])).toBeNull()
    expect(screen.queryByText('会话输入区')).toBeNull()
  })

  it.each(actionNames)('%s opens its real form without staging a draft', key => {
    const { actions } = fixture()
    const panel = openAction(key)
    expect(within(panel).getByRole('heading', { name: zh[key] })).not.toBeNull()
    expect(within(panel).getByLabelText(zh['op.content'])).not.toBeNull()
    expect(within(panel).getByRole('button', { name: zh['op.prepare'] })).not.toBeNull()
    expect(actions.primeSessionDraft).not.toHaveBeenCalled()
    expect(actions.connectWorkspaceSession).not.toHaveBeenCalled()
  })

  it('opens the new-job operation form from the palette', () => {
    const { actions } = fixture()
    fireEvent.click(screen.getByRole('button', { name: zh['top.palette'] }))
    fireEvent.click(screen.getByRole('option', { name: zh['cmd.newJob'] }))
    const panel = screen.getByRole('complementary', { name: zh['op.target'] })
    expect(within(panel).getByRole('heading', { name: zh['cmd.newJob'] })).not.toBeNull()
    expect(actions.primeSessionDraft).not.toHaveBeenCalled()
    expect(actions.connectWorkspaceSession).not.toHaveBeenCalled()
  })

  it('retains every reminder field when switching to todo and back', () => {
    fixture()
    openAction('cmd.setReminder')
    for (const [key, value] of [
      ['op.content', '发布前检查'], ['op.date', '2099-12-31'], ['op.time', '09:30'], ['op.repeat', 'daily'],
    ] as const) fireEvent.change(screen.getByLabelText(zh[key]), { target: { value } })
    openAction('cmd.addTodo')
    expect((screen.getByLabelText(zh['op.content']) as HTMLTextAreaElement).value).toBe('')
    fireEvent.change(screen.getByLabelText(zh['op.content']), { target: { value: '独立待办' } })
    openAction('cmd.setReminder')
    for (const value of ['发布前检查', '2099-12-31', '09:30']) expect(screen.getByDisplayValue(value)).not.toBeNull()
    expect((screen.getByLabelText(zh['op.repeat']) as HTMLSelectElement).value).toBe('daily')
    openAction('cmd.addTodo')
    expect(screen.getByDisplayValue('独立待办')).not.toBeNull()
  })

  it('prepares a workspace session draft and opens it in the drawer', async () => {
    const { actions } = fixture()
    selectWorkspace()
    openAction('cmd.newSession')
    submitContent()
    const drawer = await waitFor(() => screen.getByRole('dialog', { name: '空白会话' }))
    expect(within(drawer).getByText('会话输入区')).not.toBeNull()
    expect(actions.connectWorkspaceSession).toHaveBeenCalledTimes(1)
    expect(actions.connectWorkspaceSession).toHaveBeenCalledWith(workspaceId)
    expect(actions.primeSessionDraft).toHaveBeenCalledWith(composerId, '准备测试请求')
    expect(screen.queryByRole('complementary', { name: zh['op.target'] })).toBeNull()
    expect(screen.getByRole('status').textContent).toBe(zh['op.ready'])
  })

  it('prepares a draft for an open drawer session and keeps the drawer open', async () => {
    const { actions } = fixture()
    fireEvent.click(screen.getByRole('button', { name: '会话 A', exact: true }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: '会话 A' })).not.toBeNull())
    openAction('cmd.addTodo')
    submitContent('不能丢失的待办')
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(zh['op.ready']))
    expect(actions.primeSessionDraft).toHaveBeenCalledWith(targetId, `${zh['cmd.prompt.todo']}\n不能丢失的待办`)
    expect(screen.getByRole('dialog', { name: '会话 A' })).not.toBeNull()
    expect(screen.queryByRole('complementary', { name: zh['op.target'] })).toBeNull()
  })

  it.each(['new', 'existing'] as const)('does not report success when priming the %s target returns false', async destination => {
    const { actions } = fixture()
    if (destination === 'new') selectWorkspace()
    else fireEvent.click(screen.getByRole('button', { name: '会话 A', exact: true }))
    actions.primeSessionDraft.mockReturnValue(false)
    openAction('cmd.addTodo')
    submitContent('不能丢失的待办')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(zh['op.failed']))
    expect(actions.primeSessionDraft).toHaveBeenCalledWith(destination === 'new' ? composerId : targetId,
      `${zh['cmd.prompt.todo']}\n不能丢失的待办`)
    expect(screen.getByDisplayValue('不能丢失的待办')).not.toBeNull()
    expect(screen.queryByText(zh['op.ready'])).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('escape closes the operation form first and the drawer second', () => {
    fixture()
    fireEvent.click(screen.getByRole('button', { name: '会话 A', exact: true }))
    expect(screen.getByRole('dialog', { name: '会话 A' })).not.toBeNull()
    openAction('cmd.addTodo')
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('complementary', { name: zh['op.target'] })).toBeNull()
    expect(screen.getByRole('dialog', { name: '会话 A' })).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each(['operation', 'session', 'workspace', 'monitor', 'escape'] as const)('ignores a late connect after changing the target via %s', async change => {
    const { actions } = fixture()
    selectWorkspace()
    const late = reference(lateId)
    const pending = deferred<typeof late>()
    actions.connectWorkspaceSession.mockImplementationOnce(() => pending.promise)
    openAction('cmd.newSession')
    submitContent('迟到请求')
    expect(actions.connectWorkspaceSession).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: zh['op.pending'] })).not.toBeNull()

    if (change === 'operation') openAction('cmd.addTodo')
    if (change === 'session') fireEvent.click(screen.getByRole('button', { name: '会话 A', exact: true }))
    if (change === 'workspace') fireEvent.change(screen.getByRole('combobox', { name: zh['composer.workspace'] }),
      { target: { value: secondWorkspaceId } })

    if (change === 'monitor') fireEvent.click(screen.getByRole('tab', { name: zh['tabs.monitor'] }))
    if (change === 'escape') fireEvent.keyDown(document, { key: 'Escape' })
    await act(async () => { pending.resolve(late); await pending.promise })
    expect(late.release).toHaveBeenCalledTimes(1)
    expect(actions.primeSessionDraft).not.toHaveBeenCalled()
    expect(screen.queryByText(zh['op.ready'])).toBeNull()
    expect(actions.acquireDrawerSession).not.toHaveBeenCalledWith(lateId)
    if (change === 'operation') expect(screen.getByRole('heading', { name: zh['cmd.addTodo'] })).not.toBeNull()
    if (change === 'session') expect(screen.getByRole('dialog', { name: '会话 A' })).not.toBeNull()
    if (change === 'workspace') expect((screen.getByRole('combobox', { name: zh['composer.workspace'] }) as HTMLSelectElement).value).toBe(secondWorkspaceId)
  })
})
