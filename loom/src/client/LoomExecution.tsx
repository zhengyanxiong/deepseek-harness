/** Execution controls for the selected task: workspaces, sessions and business status. */
import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Button, IconCheckOutlineRegular, IconFolderOpenRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AttachSessionRequest, CatalogSnapshot, CleanupWorkspaceRequest, ExecutionRequest, ExecutionState, Lock, PrepareWorkspaceRequest,
  ReleaseExecutionRequest, StartAttemptRequest, TaskRecord, TransitionTaskRequest, WorkspaceRecord, RegisterWorkspaceRequest,
  RepositoryBranches, RepositoryBranchesRequest, InspectWorkspaceRequest, WorkspaceInspection,
} from 'dsh-workloom/types'
import type { LoomKey } from './locales.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { currentExecution } from './projection.ts'
import { COLORS, failureKey, shortCommit, STATUS_META } from './shell.ts'
import { LoomCleanupDialog } from './LoomCleanupDialog.tsx'
import { LoomTakeoverDialog } from './LoomTakeoverDialog.tsx'
import { BranchPicker } from './LoomForms.tsx'
import type { LoadWorkspaceChanges } from './LoomDiff.tsx'

type Translate = (key: LoomKey) => string

const button: CSSProperties = { color: 'inherit', background: 'transparent', border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', font: 'inherit' }
const box: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)' }
const summaryGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, margin: '2px 0 4px' }
const summaryCell: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }
const summaryLabel: CSSProperties = { color: 'var(--dsw-alias-label-caption)', fontSize: 9.5, letterSpacing: '.04em', textTransform: 'uppercase' }
const summaryValue: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--dsw-alias-label-primary)', fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }
const input: CSSProperties = { ...button, cursor: 'text', width: '100%', boxSizing: 'border-box' }
const alert: CSSProperties = { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }

/** Actions the workbench owns; the execution panel never calls the wire itself. */
export interface ExecutionActions {
  prepareWorkspace(request: PrepareWorkspaceRequest): Promise<RemoteResult<WorkspaceRecord>>
  registerWorkspace(request: RegisterWorkspaceRequest): Promise<RemoteResult<WorkspaceRecord>>
  repositoryBranches(request: RepositoryBranchesRequest): Promise<RemoteResult<RepositoryBranches>>
  inspectWorkspace(request: InspectWorkspaceRequest): Promise<RemoteResult<WorkspaceInspection>>
  pickDirectory(startPath?: string): Promise<string | null>
  startAttempt(request: StartAttemptRequest): Promise<RemoteResult<TaskRecord>>
  attachSession(request: AttachSessionRequest): Promise<RemoteResult<TaskRecord>>
  transitionTask(request: TransitionTaskRequest): Promise<RemoteResult<TaskRecord>>
  createSessionInWorkspace(path: string, agentPreset?: string): Promise<SessionId>
  cleanupWorkspace(request: CleanupWorkspaceRequest): Promise<RemoteResult<void>>
  acquireExecution(request: ExecutionRequest): Promise<RemoteResult<ExecutionState>>
  releaseExecution(request: ReleaseExecutionRequest): Promise<RemoteResult<ExecutionState>>
  takeoverExecution(request: ExecutionRequest): Promise<RemoteResult<ExecutionState>>
  onSession(sessionId: SessionId, draft?: string): void
  onChanged(): void
}

interface ExecutionPanelProps {
  t: Translate
  task: TaskRecord
  snapshot: CatalogSnapshot
  selectedSession: SessionId | undefined
  actions: ExecutionActions
  loadChanges: LoadWorkspaceChanges
  /** Whether comparisons wrap wide lines instead of scrolling sideways. */
  wrap: boolean
  onToggleWrap: () => void
}

/**
 * Render the current round, the transitions it allows, and the start form for pending or failed tasks.
 * @param props - Selected task, catalog records, the active Loom session, and Host actions.
 * @returns business controls without pretending a Session state is a task state.
 */
export function ExecutionPanel({ t, task, snapshot, selectedSession, actions, loadChanges, wrap, onToggleWrap }: ExecutionPanelProps) {
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cleanOpen, setCleanOpen] = useState(false)
  const [cleanFailure, setCleanFailure] = useState<string | undefined>(undefined)
  const [discardAllowed, setDiscardAllowed] = useState(false)
  const [takeoverConfirm, setTakeoverConfirm] = useState(false)
  const current = task.attempts.at(-1)
  const version = snapshot.versions.find(candidate => candidate.id === task.versionId)
  const agentPreset = snapshot.projects.find(candidate => candidate.id === version?.projectId)?.config.agentPreset
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
      const sessionId = await actions.createSessionInWorkspace(workspace.path, agentPreset)
      const result = await actions.attachSession({ taskId: task.id, sessionId })
      if (!result.ok) { setFailed(true); return }
      actions.onSession(sessionId)
      actions.onChanged()
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  const history = [...task.attempts].reverse()
  return <div>
    <div style={summaryGrid}>
      <div style={summaryCell}><span style={summaryLabel}>{t('attempt.current')}</span><span style={summaryValue}>{String(task.attempts.length)}</span></div>
      <div style={summaryCell}><span style={summaryLabel}>{t('workspace.title')}</span><span style={summaryValue} title={workspace?.path}>{workspace?.path ?? '—'}</span></div>
      <div style={summaryCell}><span style={summaryLabel}>{t('session.title')}</span><span style={summaryValue}>{String(current?.sessionIds.length ?? 0)}</span></div>
    </div>
    {history.length > 0 && <div style={box}>
      <p style={{ ...alert, margin: 0, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' }}>{t('task.history')}</p>
      {history.map((attempt) => {
        const number = task.attempts.indexOf(attempt) + 1
        const attemptWorkspace = snapshot.workspaces.find(candidate => candidate.id === attempt.workspaceId)
        return <div key={attempt.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 11.5, color: attempt.id === current?.id ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)' }}>
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>#{number}</span>
          <span style={{ color: STATUS_META[attempt.status].color }}>{t(STATUS_META[attempt.status].key)}</span>
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>{shortCommit(attempt.lock) ?? '—'}</span>
          <span style={{ minWidth: 0, flex: '1 1 180px', overflowWrap: 'anywhere' }}>{attemptWorkspace?.path ?? '—'}</span>
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
        wrap={wrap}
        onToggleWrap={onToggleWrap}
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

/** Compose the editable first message that carries a task into the native composer. */
export function taskDraftPrompt(t: Translate, task: TaskRecord): string {
  const title = `${t('task.draftTitle')}${task.title}`
  const description = task.description?.trim() ?? ''
  return description === '' ? title : `${title}\n\n${t('task.draftDescription')}\n${description}`
}

type WorkspaceMode = 'reuse' | 'managed' | 'direct' | 'linked'

interface RepositoryMapping {
  readonly sourceId: string
  path: string
  targetPath: string
}

function sourceLabel(path: string, repo: string): string {
  return path.trim() === '' ? repo : path
}

/** Join a user-selected root and a workspace-relative path without assuming the Host separator. */
function joinPath(root: string, path: string): string {
  if (path === '.') return root
  return `${root.replace(/[\\/]+$/u, '')}/${path.replace(/^[\\/]+/u, '')}`
}

function mappingRows(snapshot: CatalogSnapshot, projectId: string | undefined): RepositoryMapping[] {
  const project = snapshot.projects.find(candidate => candidate.id === projectId)
  return (project?.config.sources ?? []).map(source => ({ sourceId: source.id, path: source.path, targetPath: '' }))
}

/** Choose a project workspace or create one in managed, direct or linked mode, then start the task. */
function StartForm({ t, task, snapshot, versionId, actions }: StartFormProps) {
  const version = snapshot.versions.find(candidate => candidate.id === versionId)
  const project = version === undefined ? undefined : snapshot.projects.find(candidate => candidate.id === version.projectId)
  const projectId = project?.id
  const locks = snapshot.locks.filter(lock => lock.versionId === versionId)
  const agentPreset = project?.config.agentPreset
  const pool = snapshot.workspaces.filter(workspace => (workspace.projectId ?? snapshot.versions.find(candidate => candidate.id === workspace.versionId)?.projectId) === projectId && workspace.cleaned !== true)
  const priorWorkspace = task.attempts.at(-1)?.workspaceId
  const priorReusable = priorWorkspace !== undefined && pool.some(workspace => workspace.id === priorWorkspace)
  const [lockId, setLockId] = useState<Lock['id'] | undefined>(locks.at(-1)?.id)
  const [mode, setMode] = useState<WorkspaceMode>(priorReusable || pool.length > 0 ? 'reuse' : 'managed')
  const [existingId, setExistingId] = useState<WorkspaceRecord['id']>(priorWorkspace !== undefined && priorReusable ? priorWorkspace : pool[0]?.id ?? '' as WorkspaceRecord['id'])
  const [rootPath, setRootPath] = useState('')
  const [rows, setRows] = useState<RepositoryMapping[]>(() => mappingRows(snapshot, projectId))
  const [branches, setBranches] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [crossVersionConfirmed, setCrossVersionConfirmed] = useState(false)
  useEffect(() => {
    if (lockId === undefined && locks.length > 0) setLockId(locks.at(-1)?.id)
  }, [lockId, locks])
  useEffect(() => {
    setRows(mappingRows(snapshot, projectId))
    setBranches({})
    setRootPath('')
    setFailure(undefined)
  }, [projectId, snapshot])
  const selected = mode === 'reuse' ? pool.find(workspace => workspace.id === existingId) : undefined
  const crossVersion = selected !== undefined && selected.versionId !== versionId
  const sharingTasks = selected === undefined ? [] : snapshot.tasks.filter(candidate => candidate.id !== task.id && candidate.attempts.at(-1)?.workspaceId === selected.id)
  const workspaceBusy = (workspace: WorkspaceRecord): boolean => snapshot.executions.some(execution => execution.workspaceId === workspace.id && execution.owner !== null)
  const workspaceBaseline = (workspace: WorkspaceRecord): string => shortCommit(snapshot.locks.find(candidate => candidate.id === workspace.lockId)) ?? workspace.lockId
  const currentRows = rows.length === project?.config.sources.length ? rows : mappingRows(snapshot, projectId)
  const targetsReady = currentRows.length > 0 && currentRows.every(row => /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u.test(row.targetPath.trim()))
  const directRootReady = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u.test(rootPath.trim())
  const canStart = mode === 'reuse'
    ? selected !== undefined && !workspaceBusy(selected) && (!crossVersion || crossVersionConfirmed)
    : mode === 'managed'
      ? lockId !== undefined
      : mode === 'direct'
        ? lockId !== undefined && directRootReady && targetsReady
        : lockId !== undefined && targetsReady
  if (locks.length === 0) return <div style={{ ...box, marginTop: 8 }}>
    <p style={{ ...alert, margin: 0 }}>{t('lock.empty')}</p>
    <p style={{ ...alert, margin: 0 }}>{t('lock.generateFirst')}</p>
  </div>
  function updateRow(sourceId: string, patch: Partial<RepositoryMapping>): void {
    setRows(current => current.map(row => row.sourceId === sourceId ? { ...row, ...patch } : row))
    setFailure(undefined)
  }
  async function browseTarget(sourceId: string, directRoot: boolean): Promise<void> {
    const row = currentRows.find(candidate => candidate.sourceId === sourceId)
    const picked = await actions.pickDirectory(row === undefined || row.targetPath.trim() === '' ? undefined : row.targetPath.trim())
    if (picked === null) return
    if (directRoot) {
      setRootPath(picked)
      setRows(current => current.map(candidate => {
        const source = project?.config.sources.find(item => item.id === candidate.sourceId)
        return { ...candidate, path: source?.path ?? candidate.path, targetPath: project !== undefined && project.config.sources.length === 1 ? picked : joinPath(picked, source?.path ?? candidate.path) }
      }))
    } else {
      updateRow(sourceId, { targetPath: picked })
    }
  }
  async function begin(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!canStart) { setFailure('invalid_workspace_path'); return }
    setBusy(true); setFailure(undefined)
    try {
      let target: WorkspaceRecord | undefined = selected
      if (mode === 'managed') {
        if (lockId === undefined) { setFailure('missing_lock'); return }
        const requested = Object.fromEntries(Object.entries(branches).filter(([, branch]) => branch.trim() !== '').map(([sourceId, branch]) => [sourceId, branch.trim()]))
        const repositories = currentRows.map(row => ({ sourceId: row.sourceId, path: project?.config.sources.length === 1 ? '.' : (row.path.trim() === '' ? '.' : row.path.trim()), targetPath: row.targetPath.trim() }))
        const prepared = await actions.prepareWorkspace({ versionId, lockId, mode: 'managed', repositories, ...(Object.keys(requested).length === 0 ? {} : { branches: requested }) })
        if (!prepared.ok) { setFailure(prepared.error.message); return }
        target = prepared.value
      } else if (mode === 'direct') {
        if (lockId === undefined) { setFailure('missing_lock'); return }
        const single = project?.config.sources.length === 1
        const repositories = currentRows.map(row => ({ sourceId: row.sourceId, path: single ? '.' : (row.path.trim() === '' ? '.' : row.path.trim()), targetPath: single ? rootPath.trim() : row.targetPath.trim() }))
        const registered = await actions.registerWorkspace({ path: rootPath.trim(), versionId, lockId, mode: 'direct', rootOwner: 'user', repositories })
        if (!registered.ok) { setFailure(registered.error.message); return }
        target = registered.value
      } else if (mode === 'linked') {
        if (lockId === undefined) { setFailure('missing_lock'); return }
        const repositories = currentRows.map(row => {
          const trimmed = row.path.trim()
          const fallback = row.targetPath.trim().split(/[\\/]/u).filter(Boolean).at(-1) ?? 'repo'
          return { sourceId: row.sourceId, path: trimmed === '' || trimmed === '.' ? fallback : trimmed, targetPath: row.targetPath.trim() }
        })
        const prepared = await actions.prepareWorkspace({ versionId, lockId, mode: 'linked', ...(rootPath.trim() === '' ? {} : { path: rootPath.trim() }), repositories })
        if (!prepared.ok) { setFailure(prepared.error.message); return }
        target = prepared.value
      }
      if (target === undefined) { setFailure(t('state.error')); return }
      const started = await actions.startAttempt({ taskId: task.id, workspaceId: target.id })
      if (!started.ok) { setFailure(started.error.message); return }
      const sessionId = await actions.createSessionInWorkspace(target.path, agentPreset)
      const attached = await actions.attachSession({ taskId: task.id, sessionId })
      if (!attached.ok) { setFailure(attached.error.message); return }
      const acquired = await actions.acquireExecution({ workspaceId: target.id, sessionId })
      if (!acquired.ok) { setFailure(acquired.error.message); return }
      actions.onSession(sessionId, taskDraftPrompt(t, task))
      actions.onChanged()
    } catch (error) { setFailure(error instanceof Error ? error.message : t('state.error')) } finally { setBusy(false) }
  }
  const modeLabel: Readonly<Record<WorkspaceMode, LoomKey>> = {
    reuse: 'workspace.reuse', managed: 'workspace.mode.managed', direct: 'workspace.mode.direct', linked: 'workspace.mode.linked',
  }
  return <form style={box} onSubmit={event => { void begin(event) }}>
    <div style={formHeading}>{t('task.start')}</div>
    <div style={field}>
      <span>{t('workspace.mode')}</span>
      <div role="radiogroup" aria-label={t('workspace.mode')} style={modeGrid}>
        {(['reuse', 'managed', 'direct', 'linked'] as const).map(candidate => {
          const checked = mode === candidate
          return <button key={candidate} type="button" role="radio" aria-checked={checked}
            style={{ ...modeCard, ...(checked ? modeCardActive : {}) }}
            onClick={() => { setMode(candidate); setFailure(undefined) }}>
            <span style={modeTitleRow}>
              <span style={modeTitle}>{t(modeLabel[candidate])}</span>
              {checked && <span style={modeCheck}><IconCheckOutlineRegular size={12} /></span>}
            </span>
            <span style={modeHint}>{candidate === 'reuse' ? t('workspace.poolHint') : t(`workspace.mode.${candidate}Hint` as LoomKey)}</span>
          </button>
        })}
      </div>
    </div>
    {mode === 'reuse' && <>
      <div style={field}>
        <span>{t('workspace.pool')}</span>
        {pool.length === 0 ? <p style={{ ...hint, margin: 0 }}>{t('workspace.poolEmpty')}</p> : <div style={poolList}>
          {pool.map(workspace => {
            const owner = snapshot.executions.find(execution => execution.workspaceId === workspace.id)?.owner
            const busy = owner !== null && owner !== undefined
            return <button key={workspace.id} type="button" aria-pressed={workspace.id === existingId}
              disabled={busy && workspace.id !== priorWorkspace}
              style={{ ...poolRow, ...(workspace.id === existingId ? poolRowActive : {}) }}
              onClick={() => { setExistingId(workspace.id); setCrossVersionConfirmed(false); setFailure(undefined) }}>
              <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left' }}>
                <span style={{ ...monoText, color: 'var(--dsw-alias-label-primary)' }}>{workspace.path}</span>
                <span style={{ ...hint, margin: 0 }}>{t(workspace.mode === 'linked' ? 'workspace.linked' : workspace.mode === 'managed' ? 'workspace.managed' : 'workspace.direct')} · {t('workspace.reuseVersion')} {snapshot.versions.find(candidate => candidate.id === workspace.versionId)?.name ?? '—'} · {workspaceBaseline(workspace)}</span>
              </span>
              <span style={{ ...poolState, color: busy ? 'var(--dsw-alias-label-warning)' : 'var(--dsw-alias-label-caption)' }}>{busy ? t('workspace.busy') : t('ctx.ready')}</span>
            </button>
          })}
        </div>}
      </div>
      {selected !== undefined && <>
        {crossVersion && <>
          <p role="alert" style={{ ...alert, margin: 0 }}>{t('workspace.crossVersionWarning')}</p>
          <label style={{ ...hint, margin: 0, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <input type="checkbox" checked={crossVersionConfirmed} onChange={event => setCrossVersionConfirmed(event.target.checked)} />
            {t('workspace.crossVersionConfirm')}
          </label>
        </>}
        <p style={{ ...alert, margin: 0 }}>{t('lock.workspaceBaseline')}</p>
        <p style={{ ...alert, margin: 0 }}>{t('workspace.shareWarning')}</p>
        <p style={{ ...hint, margin: 0 }}>{t('workspace.cleanRequired')}</p>
        {sharingTasks.length > 0 && <p style={{ ...alert, margin: 0 }}>{t('workspace.associations')}: {sharingTasks.map(candidate => candidate.title).join(', ')}</p>}
      </>}
    </>}
    {mode === 'managed' && <>
      <p style={{ ...hint, margin: 0 }}>{t('workspace.autoHint')}</p>
      <label style={field}>{t('lock.select')}
        <select aria-label={t('lock.select')} value={lockId ?? ''} onChange={event => setLockId(event.target.value === '' ? undefined : event.target.value as Lock['id'])} style={input}>
          {locks.map(lock => <option key={lock.id} value={lock.id}>{lock.repositories.map(repository => repository.commit.slice(0, 7)).join(' + ')}</option>)}
        </select>
      </label>
      {project?.config.sources.map((source, index) => <div key={source.id} style={field}>
        <span style={fieldLabelText}>{sourceLabel(source.path, source.repo)}</span>
        <BranchPicker t={t} source={source} value={branches[source.id] ?? ''} listBranches={actions.repositoryBranches} onChange={value => setBranches(current => ({ ...current, [source.id]: value }))} />
        {index === 0 && <span style={hint}>{t('workspace.branchHint')}</span>}
      </div>)}
      <p style={{ ...hint, margin: 0 }}>{t('workspace.autoPathHint')}</p>
    </>}
    {mode === 'direct' && <>
      <p style={{ ...hint, margin: 0 }}>{t('workspace.mode.directHint')}</p>
      {(project?.config.sources.length ?? 0) > 1 && <p role="alert" style={{ ...alert, margin: 0 }}>{t('workspace.mode.directMultiWarning')}</p>}
      <label style={field}>{t('workspace.directRoot')}
        <div style={{ display: 'flex', gap: 6 }}>
          <input aria-label={t('workspace.directRoot')} placeholder={t('workspace.pathHint')} value={rootPath}
            onChange={event => {
              const value = event.target.value
              setRootPath(value); setFailure(undefined)
              if (project?.config.sources.length === 1) setRows(current => current.map(row => ({ ...row, path: '.', targetPath: value })))
            }} style={{ ...input, flex: 1 }} />
          <Button type="button" variant="outline" icon={<IconFolderOpenRegular />} onClick={() => { void browseTarget(project?.config.sources[0]?.id ?? '', true) }}>{t('workspace.browse')}</Button>
        </div>
      </label>
      <p style={{ ...hint, margin: 0 }}>{t('workspace.directRootHint')}</p>
      <div style={field}>
        <span>{t('workspace.mapping')}</span>
        <p style={{ ...hint, margin: 0 }}>{t('workspace.mappingHint')}</p>
        {project?.config.sources.map(source => {
          const row = currentRows.find(candidate => candidate.sourceId === source.id) ?? { sourceId: source.id, path: source.path, targetPath: '' }
          return <div key={source.id} style={mappingRow}>
            <span style={{ ...hint, margin: 0, flex: '1 1 120px', minWidth: 0 }}>{sourceLabel(source.path, source.repo)}</span>
            <input aria-label={`${t('workspace.logicalPath')} ${source.id}`} value={row.path} onChange={event => updateRow(source.id, { path: event.target.value })} style={{ ...input, flex: '0 1 110px' }} />
            <input aria-label={`${t('workspace.target')} ${source.id}`} value={row.targetPath} onChange={event => updateRow(source.id, { targetPath: event.target.value })} style={{ ...input, flex: '1 1 220px' }} />
            <Button type="button" variant="outline" icon={<IconFolderOpenRegular />} onClick={() => { void browseTarget(source.id, false) }}>{t('workspace.browse')}</Button>
          </div>
        })}
      </div>
      <p style={{ ...hint, margin: 0 }}>{t('workspace.cleanRequired')}</p>
    </>}
    {mode === 'linked' && <>
      <p style={{ ...hint, margin: 0 }}>{t('workspace.mode.linkedHint')}</p>
      <p role="alert" style={{ ...alert, margin: 0 }}>{t('workspace.mode.fullAccessWarning')}</p>
      <label style={field}>{t('workspace.linkRoot')}
        <input aria-label={t('workspace.linkRoot')} placeholder={t('workspace.autoPathHint')} value={rootPath} onChange={event => { setRootPath(event.target.value); setFailure(undefined) }} style={input} />
      </label>
      <p style={{ ...hint, margin: 0 }}>{t('workspace.linkRootHint')}</p>
      <div style={field}>
        <span>{t('workspace.mapping')}</span>
        <p style={{ ...hint, margin: 0 }}>{t('workspace.mappingHint')}</p>
        {project?.config.sources.map(source => {
          const row = currentRows.find(candidate => candidate.sourceId === source.id) ?? { sourceId: source.id, path: source.path, targetPath: '' }
          return <div key={source.id} style={mappingRow}>
            <span style={{ ...hint, margin: 0, flex: '1 1 120px', minWidth: 0 }}>{sourceLabel(source.path, source.repo)}</span>
            <input aria-label={`${t('workspace.logicalPath')} ${source.id}`} value={row.path} onChange={event => updateRow(source.id, { path: event.target.value })} style={{ ...input, flex: '0 1 110px' }} />
            <input aria-label={`${t('workspace.target')} ${source.id}`} placeholder={t('workspace.targetHint')} value={row.targetPath} onChange={event => updateRow(source.id, { targetPath: event.target.value })} style={{ ...input, flex: '1 1 220px' }} />
            <Button type="button" variant="outline" icon={<IconFolderOpenRegular />} onClick={() => { void browseTarget(source.id, false) }}>{t('workspace.browse')}</Button>
          </div>
        })}
      </div>
      <p style={{ ...hint, margin: 0 }}>{t('workspace.cleanRequired')}</p>
    </>}
    <p style={{ ...hint, margin: 0 }}>{t('task.draftHint')}</p>
    {failure !== undefined && <Failure t={t} failure={failure} />}
    <Button type="submit" variant="primary" className="loom-primary" disabled={busy || !canStart} style={{ alignSelf: 'flex-start' }}>
      {busy ? t('form.submitPending') : t('task.start')}
    </Button>
  </form>
}

const modeGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 6 }
const modeCard: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, padding: '8px 9px', textAlign: 'left', color: COLORS.dim, background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderColor: COLORS.border, borderRadius: 7, cursor: 'pointer', font: 'inherit', transition: 'border-color .12s ease, background-color .12s ease' }
const modeCardActive: CSSProperties = { borderColor: COLORS.accent, background: COLORS.selected, color: COLORS.text }
const modeTitleRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, width: '100%' }
const modeCheck: CSSProperties = { display: 'inline-flex', flex: 'none', marginLeft: 'auto', color: COLORS.accent }
const modeTitle: CSSProperties = { fontSize: 11.5, fontWeight: 500 }
const modeHint: CSSProperties = { color: COLORS.faint, fontSize: 10, lineHeight: 1.4 }
const poolList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const poolRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', textAlign: 'left', color: 'inherit', background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderColor: COLORS.border, borderRadius: 6, cursor: 'pointer', font: 'inherit' }
const poolRowActive: CSSProperties = { borderColor: COLORS.accent, background: COLORS.selected }
const poolState: CSSProperties = { flex: 'none', marginLeft: 'auto', fontSize: 10 }
const mappingRow: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, minWidth: 0 }
const monoText: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace', fontSize: 11 }

const formHeading: CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }
const fieldLabelText: CSSProperties = { overflowWrap: 'anywhere' }
const hint: CSSProperties = { color: 'var(--dsw-alias-label-caption)', fontSize: 11.5, lineHeight: 1.5 }
