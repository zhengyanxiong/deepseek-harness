/** Execution controls for the selected task: workspaces, sessions and business status. */
import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AttachSessionRequest, CatalogSnapshot, CleanupWorkspaceRequest, ExecutionRequest, ExecutionState, Lock, PrepareWorkspaceRequest,
  ReleaseExecutionRequest, StartAttemptRequest, TaskRecord, TransitionTaskRequest, WorkspaceRecord,
} from 'dsh-workloom/types'
import type { LoomKey } from './locales.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { currentExecution } from './projection.ts'
import { failureKey, shortCommit, STATUS_META } from './shell.ts'
import { LoomCleanupDialog } from './LoomCleanupDialog.tsx'
import { LoomTakeoverDialog } from './LoomTakeoverDialog.tsx'
import type { LoadWorkspaceChanges, RenderFileDiffSlot } from './LoomDiff.tsx'

type Translate = (key: LoomKey) => string

const button: CSSProperties = { color: 'inherit', background: 'transparent', border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', font: 'inherit' }
const box: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)' }
const input: CSSProperties = { ...button, cursor: 'text', width: '100%', boxSizing: 'border-box' }
const alert: CSSProperties = { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }

/** Actions the workbench owns; the execution panel never calls the wire itself. */
export interface ExecutionActions {
  prepareWorkspace(request: PrepareWorkspaceRequest): Promise<RemoteResult<WorkspaceRecord>>
  startAttempt(request: StartAttemptRequest): Promise<RemoteResult<TaskRecord>>
  attachSession(request: AttachSessionRequest): Promise<RemoteResult<TaskRecord>>
  transitionTask(request: TransitionTaskRequest): Promise<RemoteResult<TaskRecord>>
  createSessionInWorkspace(path: string): Promise<SessionId>
  cleanupWorkspace(request: CleanupWorkspaceRequest): Promise<RemoteResult<void>>
  acquireExecution(request: ExecutionRequest): Promise<RemoteResult<ExecutionState>>
  releaseExecution(request: ReleaseExecutionRequest): Promise<RemoteResult<ExecutionState>>
  takeoverExecution(request: ExecutionRequest): Promise<RemoteResult<ExecutionState>>
  onSession(sessionId: SessionId): void
  onChanged(): void
}

interface ExecutionPanelProps {
  t: Translate
  task: TaskRecord
  snapshot: CatalogSnapshot
  selectedSession: SessionId | undefined
  actions: ExecutionActions
  loadChanges: LoadWorkspaceChanges
  renderFactorySlot: RenderFileDiffSlot
}

/**
 * Render the current round, the transitions it allows, and the start form for pending or failed tasks.
 * @param props - Selected task, catalog records, the active Loom session, and Host actions.
 * @returns business controls without pretending a Session state is a task state.
 */
export function ExecutionPanel({ t, task, snapshot, selectedSession, actions, loadChanges, renderFactorySlot }: ExecutionPanelProps) {
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cleanOpen, setCleanOpen] = useState(false)
  const [cleanFailure, setCleanFailure] = useState<string | undefined>(undefined)
  const [discardAllowed, setDiscardAllowed] = useState(false)
  const [takeoverConfirm, setTakeoverConfirm] = useState(false)
  const current = task.attempts.at(-1)
  const version = snapshot.versions.find(candidate => candidate.id === task.versionId)
  const workspace = current === undefined ? undefined : snapshot.workspaces.find(candidate => candidate.id === current.workspaceId)
  const execution = currentExecution(snapshot, task)
  const boundSession = current?.sessionIds.at(-1)
  const actorSession = selectedSession ?? boundSession
  const ownsExecution = execution?.owner != null && execution.owner.sessionId === actorSession
  const waitingExecution = actorSession !== undefined && execution?.waiting.includes(actorSession) === true
  async function transition(target: TransitionTaskRequest['target'], actor: TransitionTaskRequest['actor']): Promise<void> {
    setBusy(true); setFailed(false)
    try {
      const result = await actions.transitionTask({ taskId: task.id, target, actor })
      if (!result.ok) { setFailed(true); return }
      actions.onChanged()
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  async function attach(): Promise<void> {
    if (selectedSession === undefined || workspace === undefined) return
    setBusy(true); setFailed(false)
    try {
      const result = await actions.attachSession({ taskId: task.id, sessionId: selectedSession })
      if (!result.ok) { setFailed(true); return }
      actions.onChanged()
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  async function clean(discard: boolean): Promise<void> {
    if (workspace === undefined) return
    setBusy(true); setFailed(false)
    try {
      const result = await actions.cleanupWorkspace({ workspaceId: workspace.id, discardChanges: discard })
      if (!result.ok) {
        setCleanFailure(result.error.message)
        const key = failureKey(result.error.message)
        setDiscardAllowed(!discard && (key === 'error.workspaceChanges' || key === 'error.workspaceUnpushed'))
        return
      }
      setCleanOpen(false); setCleanFailure(undefined); setDiscardAllowed(false)
      actions.onChanged()
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  async function acquire(): Promise<void> {
    if (workspace === undefined || actorSession === undefined) return
    setBusy(true); setFailed(false)
    try {
      const result = await actions.acquireExecution({ workspaceId: workspace.id, sessionId: actorSession })
      if (!result.ok) { setFailed(true); return }
      actions.onChanged()
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  async function release(): Promise<void> {
    if (workspace === undefined || execution?.owner === null || execution?.owner === undefined) return
    setBusy(true); setFailed(false)
    try {
      const result = await actions.releaseExecution({ workspaceId: workspace.id, sessionId: execution.owner.sessionId, generation: Number(execution.owner.generation) })
      if (!result.ok) { setFailed(true); return }
      actions.onChanged()
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  async function takeover(): Promise<void> {
    if (workspace === undefined || actorSession === undefined) return
    setBusy(true); setFailed(false)
    try {
      const result = await actions.takeoverExecution({ workspaceId: workspace.id, sessionId: actorSession })
      if (!result.ok) { setFailed(true); return }
      setTakeoverConfirm(false)
      actions.onChanged()
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  async function openSession(): Promise<void> {
    if (workspace === undefined) return
    setBusy(true); setFailed(false)
    try {
      const sessionId = await actions.createSessionInWorkspace(workspace.path)
      const result = await actions.attachSession({ taskId: task.id, sessionId })
      if (!result.ok) { setFailed(true); return }
      actions.onSession(sessionId)
      actions.onChanged()
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  const history = [...task.attempts].reverse()
  return <div>
    <p style={{ margin: '0 0 4px' }}>{t('attempt.current')}: {task.attempts.length}</p>
    {workspace !== undefined && <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{t('workspace.path')}: {workspace.path}</p>}
    {current !== undefined && current.sessionIds.length > 0 && <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{t('session.title')}: {current.sessionIds.length}</p>}
    {history.length > 0 && <div style={box}>
      <p style={{ ...alert, margin: 0, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' }}>{t('task.history')}</p>
      {history.map((attempt) => {
        const number = task.attempts.indexOf(attempt) + 1
        const attemptWorkspace = snapshot.workspaces.find(candidate => candidate.id === attempt.workspaceId)
        return <div key={attempt.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 11.5, color: attempt.id === current?.id ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)' }}>
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>#{number}</span>
          <span style={{ color: STATUS_META[attempt.status].color }}>{t(STATUS_META[attempt.status].key)}</span>
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>{shortCommit(attempt.lock) ?? '—'}</span>
          <span style={{ overflowWrap: 'anywhere' }}>{attemptWorkspace?.path ?? '—'}</span>
          <span>{t('sessions')}: {attempt.sessionIds.length}</span>
        </div>
      })}
    </div>}
    {(task.status === 'pending' || task.status === 'failed') && version !== undefined && <StartForm t={t} task={task} snapshot={snapshot} versionId={version.id} actions={actions} />}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
      {task.status === 'running' && <>
        <button style={button} disabled={busy} onClick={() => { void transition('review', 'agent') }}>{t('task.review')}</button>
        <button style={button} disabled={busy} onClick={() => { void transition('failed', 'human') }}>{t('task.fail')}</button>
      </>}
      {task.status === 'review' && <>
        <button style={button} disabled={busy} onClick={() => { void transition('completed', 'human') }}>{t('task.accept')}</button>
        <button style={button} disabled={busy} onClick={() => { void transition('running', 'human') }}>{t('task.continue')}</button>
        <button style={button} disabled={busy} onClick={() => { void transition('failed', 'human') }}>{t('task.fail')}</button>
      </>}
      {(task.status === 'running' || task.status === 'review') && workspace !== undefined && <>
        <button style={button} disabled={busy} onClick={() => { void openSession() }}>{t('session.continue')}</button>
        {selectedSession !== undefined && current !== undefined && !current.sessionIds.includes(selectedSession) && <button style={button} disabled={busy} onClick={() => { void attach() }}>{t('session.open')}</button>}
      </>}
    </div>
    {workspace !== undefined && boundSession !== undefined && workspace.cleaned !== true && <div style={{ ...box, gap: 6 }}>
      <p style={{ ...alert, margin: 0 }}>{t('execution.owner')}: {execution?.owner === null || execution?.owner === undefined ? t('ctx.ready') : execution.owner.sessionId.slice(0, 8)}</p>
      {execution?.takeover !== null && execution?.takeover !== undefined && <p style={{ ...alert, margin: 0 }}>{execution.takeover.stopStatus === 'requested' ? t('execution.stopping') : t('execution.blocked')}</p>}
      {execution?.owner !== null && execution?.owner !== undefined && !ownsExecution && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {!waitingExecution && <button style={button} disabled={busy || execution?.takeover !== null} onClick={() => { void acquire() }}>{t('execution.wait')}</button>}
        {waitingExecution && <span style={{ ...alert, margin: 0 }}>{t('execution.waiting')}</span>}
        {!takeoverConfirm && <button style={button} disabled={busy || execution?.takeover !== null} onClick={() => { setTakeoverConfirm(true); setFailed(false) }}>{t('execution.takeover')}</button>}
      </div>}
      {ownsExecution && (execution?.takeover === null || execution?.takeover === undefined) && <button style={button} disabled={busy} onClick={() => { void release() }}>{t('execution.release')}</button>}
    </div>}
    {workspace !== undefined && workspace.cleaned !== true && <div style={{ marginTop: 8 }}>
      <button style={button} disabled={busy} onClick={() => { setCleanOpen(true); setCleanFailure(undefined); setDiscardAllowed(false) }}>{t('workspace.cleanup')}</button>
      {cleanOpen && <LoomCleanupDialog
        t={t}
        workspace={workspace}
        busy={busy}
        failure={cleanFailure}
        discardAllowed={discardAllowed}
        loadChanges={loadChanges}
        renderFactorySlot={renderFactorySlot}
        onConfirm={() => { void clean(false) }}
        onDiscard={() => { void clean(true) }}
        onCancel={() => { setCleanOpen(false); setCleanFailure(undefined); setDiscardAllowed(false) }}
      />}
    </div>}
    <LoomTakeoverDialog
      t={t}
      open={takeoverConfirm}
      busy={busy}
      failed={failed}
      onCancel={() => setTakeoverConfirm(false)}
      onConfirm={() => { void takeover() }}
    />
    {failed && !takeoverConfirm && <p role="alert" style={alert}>{t('state.error')}</p>}
  </div>
}

interface StartFormProps {
  t: Translate
  task: TaskRecord
  snapshot: CatalogSnapshot
  versionId: TaskRecord['versionId']
  actions: ExecutionActions
}

function Failure({ t, failure }: { t: Translate; failure: string }): ReactNode {
  const key = failureKey(failure)
  return <p role="alert" style={alert}>{key === undefined ? t('state.error') : t(key)}
    {key === undefined && <span style={{ display: 'block', opacity: 0.7, marginTop: 4, overflowWrap: 'anywhere' }}>{failure}</span>}
  </p>
}

/** Prepare an isolated workspace from one Lock, start the round, then open its native Session. */
function StartForm({ t, task, snapshot, versionId, actions }: StartFormProps) {
  const locks = snapshot.locks.filter(lock => lock.versionId === versionId)
  const [lockId, setLockId] = useState<Lock['id'] | undefined>(locks.at(-1)?.id)
  const [custom, setCustom] = useState(false)
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [workspaceId, setWorkspaceId] = useState<WorkspaceRecord['id'] | 'new'>('new')
  useEffect(() => {
    if (lockId === undefined && locks.length > 0) setLockId(locks.at(-1)?.id)
  }, [lockId, locks])
  const available = snapshot.workspaces.filter(workspace => workspace.versionId === versionId && workspace.cleaned !== true)
  const selected = workspaceId === 'new' ? undefined : available.find(workspace => workspace.id === workspaceId)
  const sharingTasks = selected === undefined ? [] : snapshot.tasks.filter(candidate => candidate.id !== task.id && candidate.attempts.at(-1)?.workspaceId === selected.id)
  const workspaceBusy = (workspace: WorkspaceRecord): boolean => snapshot.tasks.some(candidate => candidate.id !== task.id && candidate.status === 'running' && candidate.attempts.at(-1)?.workspaceId === workspace.id)
    || snapshot.executions.some(execution => execution.workspaceId === workspace.id && execution.owner !== null)
  const workspaceBaseline = (workspace: WorkspaceRecord): string => shortCommit(snapshot.locks.find(candidate => candidate.id === workspace.lockId)) ?? workspace.lockId
  if (locks.length === 0) return <p style={{ ...alert, marginTop: 8 }}>{t('lock.empty')}</p>
  const absolute = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u.test(path.trim())
  async function start(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (lockId === undefined) { setFailure('missing_lock'); return }
    if (custom && !absolute) { setFailure('invalid_path'); return }
    setBusy(true); setFailure(undefined)
    try {
      const prepared = selected === undefined ? await actions.prepareWorkspace({ versionId, lockId, ...(custom ? { path: path.trim() } : {}) }) : undefined
      if (prepared !== undefined && !prepared.ok) { setFailure(prepared.error.message); return }
      const target = selected ?? (prepared !== undefined && prepared.ok ? prepared.value : undefined)
      if (target === undefined) { setFailure(t('state.error')); return }
      const started = await actions.startAttempt({ taskId: task.id, workspaceId: target.id })
      if (!started.ok) { setFailure(started.error.message); return }
      const sessionId = await actions.createSessionInWorkspace(target.path)
      const attached = await actions.attachSession({ taskId: task.id, sessionId })
      if (!attached.ok) { setFailure(attached.error.message); return }
      setPath('')
      actions.onSession(sessionId)
      actions.onChanged()
    } catch (error) { setFailure(error instanceof Error ? error.message : t('state.error')) } finally { setBusy(false) }
  }
  return <form style={box} onSubmit={event => { void start(event) }}>
    <label style={{ ...alert }}>{t('lock.select')}
      <select aria-label={t('lock.select')} value={lockId ?? ''} disabled={selected !== undefined} onChange={event => setLockId(event.target.value === '' ? undefined : event.target.value as Lock['id'])} style={input}>
        {locks.map(lock => <option key={lock.id} value={lock.id}>{lock.repositories.map(repository => repository.commit.slice(0, 7)).join(' + ')}</option>)}
      </select>
    </label>
    <label style={{ ...alert }}>{t('workspace.select')}
      <select aria-label={t('workspace.select')} value={workspaceId} onChange={event => {
        const next = event.target.value as WorkspaceRecord['id'] | 'new'
        setWorkspaceId(next); setFailure(undefined)
        if (next !== 'new') { const workspace = available.find(candidate => candidate.id === next); if (workspace !== undefined) setLockId(workspace.lockId) }
      }} style={input}>
        <option value="new">{t('workspace.auto')}</option>
        {available.map(workspace => <option key={workspace.id} value={workspace.id} disabled={workspaceBusy(workspace)}>{workspace.path} · {workspaceBaseline(workspace)}{workspaceBusy(workspace) ? ` · ${t('workspace.busy')}` : ''}</option>)}
      </select>
    </label>
    {selected !== undefined && <>
      <p style={{ ...alert, margin: 0 }}>{t('lock.workspaceBaseline')}</p>
      <p style={{ ...alert, margin: 0 }}>{t('workspace.shareWarning')}</p>
      {sharingTasks.length > 0 && <p style={{ ...alert, margin: 0 }}>{t('workspace.associations')}: {sharingTasks.map(candidate => candidate.title).join(', ')}</p>}
    </>}
    {selected === undefined && <button type="button" style={button} aria-pressed={custom} onClick={() => { setCustom(value => !value); setFailure(undefined) }}>{t('workspace.custom')}</button>}
    {selected === undefined && custom && <input aria-label={t('workspace.path')} placeholder={t('workspace.path')} value={path} onChange={event => setPath(event.target.value)} style={input} />}
    {selected === undefined && custom && <p style={{ ...alert, margin: 0 }}>{t('workspace.absoluteRequired')}</p>}
    {failure !== undefined && <Failure t={t} failure={failure} />}
    <button type="submit" style={button} disabled={busy}>{busy ? t('form.submitPending') : t('task.start')}</button>
  </form>
}
