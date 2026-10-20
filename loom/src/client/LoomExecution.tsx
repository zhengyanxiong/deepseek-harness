/** Execution controls for the selected task: workspaces, sessions and business status. */
import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Button, IconFolderOpenRegular, SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AttachSessionRequest, CatalogSnapshot, CleanupWorkspaceRequest, ExecutionRequest, ExecutionState, Lock, PrepareWorkspaceRequest,
  ReleaseExecutionRequest, StartAttemptRequest, TaskRecord, TransitionTaskRequest, WorkspaceRecord, RegisterWorkspaceRequest,
  RepositoryBranches, RepositoryBranchesRequest, InspectWorkspaceRequest, WorkspaceInspection,
} from 'dsh-workloom/types'
import type { LoomKey } from './locales.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { currentExecution } from './projection.ts'
import { failureKey, shortCommit, STATUS_META } from './shell.ts'
import { LoomCleanupDialog } from './LoomCleanupDialog.tsx'
import { LoomTakeoverDialog } from './LoomTakeoverDialog.tsx'
import { BranchPicker } from './LoomForms.tsx'
import type { LoadWorkspaceChanges, RenderFileDiffSlot } from './LoomDiff.tsx'

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
  renderFactorySlot: RenderFileDiffSlot
  /** Whether comparisons wrap wide lines instead of scrolling sideways. */
  wrap: boolean
  onToggleWrap: () => void
}

/**
 * Render the current round, the transitions it allows, and the start form for pending or failed tasks.
 * @param props - Selected task, catalog records, the active Loom session, and Host actions.
 * @returns business controls without pretending a Session state is a task state.
 */
export function ExecutionPanel({ t, task, snapshot, selectedSession, actions, loadChanges, renderFactorySlot, wrap, onToggleWrap }: ExecutionPanelProps) {
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
        renderFactorySlot={renderFactorySlot}
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

type WorkspaceMode = 'new' | 'existing'

function sourceLabel(path: string, repo: string): string {
  return path.trim() === '' ? repo : path
}

/** Choose a Lock, a workspace origin and optional branches, then start the task in a native Session. */
function StartForm({ t, task, snapshot, versionId, actions }: StartFormProps) {
  const version = snapshot.versions.find(candidate => candidate.id === versionId)
  const project = version === undefined ? undefined : snapshot.projects.find(candidate => candidate.id === version.projectId)
  const locks = snapshot.locks.filter(lock => lock.versionId === versionId)
  const agentPreset = project?.config.agentPreset
  const [lockId, setLockId] = useState<Lock['id'] | undefined>(locks.at(-1)?.id)
  const reusable = snapshot.workspaces.filter(workspace => workspace.versionId === versionId && workspace.cleaned !== true)
  const priorWorkspace = task.attempts.at(-1)?.workspaceId
  const priorReusable = priorWorkspace !== undefined && reusable.some(workspace => workspace.id === priorWorkspace)
  const [mode, setMode] = useState<WorkspaceMode>(priorReusable || reusable.length > 0 ? 'existing' : 'new')
  const [existingId, setExistingId] = useState<WorkspaceRecord['id'] | 'custom'>(priorReusable ? priorWorkspace : reusable[0]?.id ?? 'custom')
  const [path, setPath] = useState('')
  const [branches, setBranches] = useState<Record<string, string>>({})
  const [inspection, setInspection] = useState<WorkspaceInspection>()
  const [inspecting, setInspecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (lockId === undefined && locks.length > 0) setLockId(locks.at(-1)?.id)
  }, [lockId, locks])
  const available = reusable
  const selected = mode === 'existing' && existingId !== 'custom' ? available.find(workspace => workspace.id === existingId) : undefined
  const sharingTasks = selected === undefined ? [] : snapshot.tasks.filter(candidate => candidate.id !== task.id && candidate.attempts.at(-1)?.workspaceId === selected.id)
  const workspaceBusy = (workspace: WorkspaceRecord): boolean => snapshot.tasks.some(candidate => candidate.id !== task.id && candidate.status === 'running' && candidate.attempts.at(-1)?.workspaceId === workspace.id)
    || snapshot.executions.some(execution => execution.workspaceId === workspace.id && execution.owner !== null)
  const workspaceBaseline = (workspace: WorkspaceRecord): string => shortCommit(snapshot.locks.find(candidate => candidate.id === workspace.lockId)) ?? workspace.lockId
  const inspectedReady = inspection !== undefined && inspection.repositories.length > 0 && inspection.repositories.every(repository => repository.error === undefined)
  const canStart = mode === 'new' || selected !== undefined || (path.trim() !== '' && inspectedReady && !inspecting)
  if (locks.length === 0) return <div style={{ ...box, marginTop: 8 }}>
    <p style={{ ...alert, margin: 0 }}>{t('lock.empty')}</p>
    <p style={{ ...alert, margin: 0 }}>{t('lock.generateFirst')}</p>
  </div>
  const absolute = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u.test(path.trim())
  async function browse(): Promise<void> {
    const picked = await actions.pickDirectory(path.trim() === '' ? undefined : path.trim())
    if (picked === null) return
    setPath(picked); setInspection(undefined); setFailure(undefined)
    await inspect(picked)
  }
  async function inspect(target: string): Promise<void> {
    if (target.trim() === '') return
    setInspecting(true)
    try {
      const result = await actions.inspectWorkspace({ path: target.trim(), versionId })
      if (!result.ok) { setFailure(result.error.message); return }
      setInspection(result.value)
      const current: Record<string, string> = {}
      for (const repository of result.value.repositories) {
        if (repository.current !== undefined) current[repository.sourceId] = repository.current
      }
      setBranches(current)
    } catch (error) { setFailure(error instanceof Error ? error.message : t('state.error')) } finally { setInspecting(false) }
  }
  async function start(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (lockId === undefined) { setFailure('missing_lock'); return }
    if (mode === 'existing' && selected === undefined && !absolute) { setFailure('invalid_path'); return }
    if (mode === 'existing' && selected === undefined && !inspectedReady) { setFailure('invalid_workspace_path'); return }
    setBusy(true); setFailure(undefined)
    try {
      let target: WorkspaceRecord | undefined = selected
      if (target === undefined && mode === 'new') {
        const requested = Object.fromEntries(Object.entries(branches).filter(([, branch]) => branch.trim() !== '').map(([sourceId, branch]) => [sourceId, branch.trim()]))
        const prepared = await actions.prepareWorkspace({ versionId, lockId, ...(Object.keys(requested).length === 0 ? {} : { branches: requested }) })
        if (!prepared.ok) { setFailure(prepared.error.message); return }
        target = prepared.value
      } else if (target === undefined) {
        const current = Object.fromEntries((inspection?.repositories ?? []).flatMap(repository => repository.current === undefined ? [] : [[repository.sourceId, repository.current] as const]))
        const registered = await actions.registerWorkspace({
          path: path.trim(), versionId, lockId,
          ...(Object.keys(current).length === 0 ? {} : { branches: current }),
        })
        if (!registered.ok) { setFailure(registered.error.message); return }
        target = registered.value
      }
      if (target === undefined) { setFailure(t('state.error')); return }
      const started = await actions.startAttempt({ taskId: task.id, workspaceId: target.id })
      if (!started.ok) { setFailure(started.error.message); return }
      const sessionId = await actions.createSessionInWorkspace(target.path, agentPreset)
      const attached = await actions.attachSession({ taskId: task.id, sessionId })
      if (!attached.ok) { setFailure(attached.error.message); return }
      actions.onSession(sessionId, taskDraftPrompt(t, task))
      actions.onChanged()
    } catch (error) { setFailure(error instanceof Error ? error.message : t('state.error')) } finally { setBusy(false) }
  }
  return <form style={box} onSubmit={event => { void start(event) }}>
    <div style={formHeading}>{t('task.start')}</div>
    <label style={field}>{t('lock.select')}
      <select aria-label={t('lock.select')} value={lockId ?? ''} disabled={selected !== undefined} onChange={event => setLockId(event.target.value === '' ? undefined : event.target.value as Lock['id'])} style={input}>
        {locks.map(lock => <option key={lock.id} value={lock.id}>{lock.repositories.map(repository => repository.commit.slice(0, 7)).join(' + ')}</option>)}
      </select>
    </label>
    <div style={field}>
      <span>{t('workspace.source')}</span>
      <SegmentedControl<WorkspaceMode> id="loom-workspace-mode" className="loom-workspace-switch" value={mode} label={t('workspace.source')}
        options={[
          { value: 'new', label: t('workspace.auto') },
          { value: 'existing', label: t('workspace.existing') },
        ]}
        onChange={next => { setMode(next); setFailure(undefined) }} />
    </div>
    {mode === 'new' && <div id="loom-workspace-mode-new-panel" role="tabpanel" aria-labelledby="loom-workspace-mode-new" style={{ display: 'contents' }}>
      <p style={{ ...hint, margin: 0 }}>{t('workspace.autoHint')}</p>
      {project?.config.sources.map((source, index) => <div key={source.id} style={field}>
        <span style={fieldLabelText}>{sourceLabel(source.path, source.repo)}</span>
        <BranchPicker t={t} source={source} value={branches[source.id] ?? ''} listBranches={actions.repositoryBranches} onChange={value => setBranches(current => ({ ...current, [source.id]: value }))} />
        {index === 0 && <span style={hint}>{t('workspace.branchHint')}</span>}
      </div>)}
    </div>}
    {mode === 'existing' && <div id="loom-workspace-mode-existing-panel" role="tabpanel" aria-labelledby="loom-workspace-mode-existing" style={{ display: 'contents' }}>
      {available.length > 0 && <label style={field}>{t('workspace.select')}
        <select aria-label={t('workspace.select')} value={existingId} onChange={event => {
          const next = event.target.value as WorkspaceRecord['id'] | 'custom'
          setExistingId(next); setInspection(undefined); setFailure(undefined)
          if (next !== 'custom') {
            const workspace = available.find(candidate => candidate.id === next)
            if (workspace !== undefined) setLockId(workspace.lockId)
          }
        }} style={input}>
          <option value="custom">{t('workspace.pickFolder')}</option>
          {available.map(workspace => <option key={workspace.id} value={workspace.id} disabled={workspaceBusy(workspace)}>{workspace.path} · {workspaceBaseline(workspace)}{workspaceBusy(workspace) ? ` · ${t('workspace.busy')}` : ''}</option>)}
        </select>
      </label>}
      {selected === undefined && <>
        <div style={{ display: 'flex', gap: 6 }}>
          <input aria-label={t('workspace.path')} placeholder={t('workspace.pathHint')} value={path}
            onChange={event => { setPath(event.target.value); setInspection(undefined); setFailure(undefined) }}
            onBlur={() => { if (path.trim() !== '' && inspection === undefined) void inspect(path) }} style={{ ...input, flex: 1 }} />
          <Button type="button" variant="outline" icon={<IconFolderOpenRegular />} onClick={() => { void browse() }}>{t('workspace.browse')}</Button>
        </div>
        <p style={{ ...hint, margin: 0 }}>{t('workspace.gitOnly')}</p>
        {inspecting && <p style={{ ...alert, margin: 0 }}>{t('workspace.inspecting')}</p>}
        {inspection !== undefined && !inspecting && !inspectedReady && <>
          <p role="alert" style={alert}>{t('error.invalidWorkspacePath')}</p>
          <p style={{ ...hint, margin: 0 }}>{t('workspace.rootHint')}</p>
        </>}
        {inspection !== undefined && !inspecting && <div style={repoList}>
          {inspection.repositories.map(repository => <div key={repository.sourceId} style={repoRow}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repository.directory}</span>
            {repository.error === undefined
              ? <span style={{ color: 'var(--dsw-alias-state-success-primary)', flex: 'none' }}>{repository.current ?? t('workspace.detached')}</span>
              : <span style={{ color: 'var(--dsw-alias-label-error)', flex: 'none' }}>{t('workspace.notGit')}</span>}
          </div>)}
        </div>}
      </>}
      {selected !== undefined && <>
        <p style={{ ...alert, margin: 0 }}>{t('lock.workspaceBaseline')}</p>
        <p style={{ ...alert, margin: 0 }}>{t('workspace.shareWarning')}</p>
        {sharingTasks.length > 0 && <p style={{ ...alert, margin: 0 }}>{t('workspace.associations')}: {sharingTasks.map(candidate => candidate.title).join(', ')}</p>}
        <p style={{ ...hint, margin: 0 }}>{t('workspace.existingBranchHint')}</p>
        {project !== undefined && <div style={repoList}>
          {project.config.sources.map(source => <div key={source.id} style={repoRow}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sourceLabel(source.path, source.repo)}</span>
            <span style={{ color: 'var(--dsw-alias-label-caption)', flex: 'none' }}>{selected.branches?.[source.id] ?? t('workspace.detached')}</span>
          </div>)}
        </div>}
      </>}
      {failure === undefined && !canStart && path.trim() === '' && <p style={{ ...hint, margin: 0 }}>{t('workspace.pickFolderHint')}</p>}
    </div>}
    {mode === 'new' && <p style={{ ...hint, margin: 0 }}>{t('workspace.autoPathHint')}</p>}
    <p style={{ ...hint, margin: 0 }}>{t('task.draftHint')}</p>
    {failure !== undefined && <Failure t={t} failure={failure} />}
    <Button type="submit" variant="primary" className="loom-primary" disabled={busy || (mode === 'existing' && !canStart)} style={{ alignSelf: 'flex-start' }}>
      {busy ? t('form.submitPending') : t('task.start')}
    </Button>
  </form>
}

const formHeading: CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }
const fieldLabelText: CSSProperties = { overflowWrap: 'anywhere' }
const hint: CSSProperties = { color: 'var(--dsw-alias-label-caption)', fontSize: 11.5, lineHeight: 1.5 }
const repoList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, padding: '7px 8px', borderRadius: 6, background: 'var(--dsw-alias-bg-layer-2)', border: '0.5px solid var(--dsw-alias-border-l4)' }
const repoRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, minWidth: 0, fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)' }
