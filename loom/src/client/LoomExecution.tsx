/** Execution controls for the selected task: workspaces, sessions and business status. */
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AttachSessionRequest, CatalogSnapshot, CleanupWorkspaceRequest, Lock, PrepareWorkspaceRequest, StartAttemptRequest,
  TaskRecord, TransitionTaskRequest, WorkspaceRecord,
} from 'dsh-loom/types'
import type { LoomKey } from './locales.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

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
  onSession(sessionId: SessionId): void
  onChanged(): void
}

interface ExecutionPanelProps {
  t: Translate
  task: TaskRecord
  snapshot: CatalogSnapshot
  selectedSession: SessionId | undefined
  actions: ExecutionActions
}

/**
 * Render the current round, the transitions it allows, and the start form for pending or failed tasks.
 * @param props - Selected task, catalog records, the active Loom session, and Host actions.
 * @returns business controls without pretending a Session state is a task state.
 */
export function ExecutionPanel({ t, task, snapshot, selectedSession, actions }: ExecutionPanelProps) {
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const current = task.attempts.at(-1)
  const version = snapshot.versions.find(candidate => candidate.id === task.versionId)
  const workspace = current === undefined ? undefined : snapshot.workspaces.find(candidate => candidate.id === current.workspaceId)
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
  async function clean(): Promise<void> {
    if (workspace === undefined) return
    setBusy(true); setFailed(false)
    try {
      const result = await actions.cleanupWorkspace({ workspaceId: workspace.id, discardChanges: true })
      if (!result.ok) { setFailed(true); return }
      setCleaning(false)
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
  return <div>
    <p style={{ margin: '0 0 4px' }}>{t('attempt.current')}: {task.attempts.length}</p>
    {workspace !== undefined && <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{t('workspace.path')}: {workspace.path}</p>}
    {current !== undefined && current.sessionIds.length > 0 && <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{t('session.title')}: {current.sessionIds.length}</p>}
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
    {workspace !== undefined && workspace.cleaned !== true && <div style={{ marginTop: 8 }}>
      {cleaning ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={alert}>{t('workspace.cleanupWarning')}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={button} disabled={busy} onClick={() => { void clean() }}>{t('workspace.cleanupConfirm')}</button>
          <button style={button} disabled={busy} onClick={() => setCleaning(false)}>{t('form.cancel')}</button>
        </div>
      </div> : <button style={button} disabled={busy} onClick={() => setCleaning(true)}>{t('workspace.cleanup')}</button>}
    </div>}
    {failed && <p role="alert" style={alert}>{t('state.error')}</p>}
  </div>
}

interface StartFormProps {
  t: Translate
  task: TaskRecord
  snapshot: CatalogSnapshot
  versionId: TaskRecord['versionId']
  actions: ExecutionActions
}

/** Prepare a workspace from one Lock, start the round, then open its first native Session. */
function StartForm({ t, task, snapshot, versionId, actions }: StartFormProps) {
  const locks = snapshot.locks.filter(lock => lock.versionId === versionId)
  const [lockId, setLockId] = useState<Lock['id'] | undefined>(locks.at(-1)?.id)
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (lockId === undefined && locks.length > 0) setLockId(locks.at(-1)?.id)
  }, [lockId, locks])
  if (locks.length === 0) return <p style={{ ...alert, marginTop: 8 }}>{t('lock.empty')}</p>
  async function start(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (lockId === undefined || path.trim() === '') { setFailed(true); return }
    setBusy(true); setFailed(false)
    try {
      const prepared = await actions.prepareWorkspace({ path: path.trim(), versionId, lockId })
      if (!prepared.ok) { setFailed(true); return }
      const started = await actions.startAttempt({ taskId: task.id, workspaceId: prepared.value.id })
      if (!started.ok) { setFailed(true); return }
      const sessionId = await actions.createSessionInWorkspace(prepared.value.path)
      const attached = await actions.attachSession({ taskId: task.id, sessionId })
      if (!attached.ok) { setFailed(true); return }
      setPath('')
      actions.onSession(sessionId)
      actions.onChanged()
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  return <form style={box} onSubmit={event => { void start(event) }}>
    <label style={{ ...alert }}>{t('lock.select')}
      <select aria-label={t('lock.select')} value={lockId ?? ''} onChange={event => setLockId(event.target.value === '' ? undefined : event.target.value as Lock['id'])} style={input}>
        {locks.map(lock => <option key={lock.id} value={lock.id}>{lock.repositories.map(repository => repository.commit.slice(0, 7)).join(' + ')}</option>)}
      </select>
    </label>
    <input aria-label={t('workspace.path')} placeholder={t('workspace.path')} value={path} onChange={event => setPath(event.target.value)} style={input} />
    {failed && <p role="alert" style={alert}>{t('state.error')}</p>}
    <button type="submit" style={button} disabled={busy}>{busy ? t('form.submitPending') : t('task.start')}</button>
  </form>
}
