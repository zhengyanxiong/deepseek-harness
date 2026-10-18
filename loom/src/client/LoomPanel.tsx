/** Loom workbench: catalog-driven projects/tasks beside the native Session surface. */
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRuntime, SessionProviderComponent } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { AttachSessionRequest, CatalogSnapshot, CleanupWorkspaceRequest, CreateTaskRequest, CreateVersionRequest, GenerateLockRequest, Lock, PrepareWorkspaceRequest, ProjectConfig, ProjectRecord, StartAttemptRequest, TaskRecord, TransitionTaskRequest, VersionRecord, WorkspaceChangesRequest, WorkspaceRecord, WorkspaceRepositoryChangesRecord } from 'dsh-loom/types'
import { TaskBoard } from './TaskBoard.tsx'
import { LockButton, ProjectForm, TaskForm, VersionForm } from './LoomForms.tsx'
import { ExecutionPanel, type ExecutionActions } from './LoomExecution.tsx'
import { LoomDiff } from './LoomDiff.tsx'
import type { BoardFilter, BoardTask } from './board.ts'
import { NS } from './locales.ts'

/** Host catalog access owned by the registration context. */
export interface LoomInjected {
  retainSession(id: SessionId): SessionReference
  loadSnapshot(): Promise<RemoteResult<CatalogSnapshot>>
  createProject(request: ProjectConfig): Promise<RemoteResult<ProjectRecord>>
  createVersion(request: CreateVersionRequest): Promise<RemoteResult<VersionRecord>>
  createTask(request: CreateTaskRequest): Promise<RemoteResult<TaskRecord>>
  generateLock(request: GenerateLockRequest): Promise<RemoteResult<Lock>>
  prepareWorkspace(request: PrepareWorkspaceRequest): Promise<RemoteResult<WorkspaceRecord>>
  startAttempt(request: StartAttemptRequest): Promise<RemoteResult<TaskRecord>>
  attachSession(request: AttachSessionRequest): Promise<RemoteResult<TaskRecord>>
  transitionTask(request: TransitionTaskRequest): Promise<RemoteResult<TaskRecord>>
  createSessionInWorkspace(path: string): Promise<SessionId>
  workspaceChanges(request: WorkspaceChangesRequest): Promise<RemoteResult<{ repositories: WorkspaceRepositoryChangesRecord[] }>>
  cleanupWorkspace(request: CleanupWorkspaceRequest): Promise<RemoteResult<void>>
}
interface LoomSeat {
  SessionProvider: SessionProviderComponent
  renderSlot(key: 'loom.conversation', owner: object): ReactNode
}
/** Root kit plus the session-scoped child declared by Loom. */
export type LoomPanelProps = PropsRuntime<'main'> & InjectFace<LoomInjected> & PropsLocale<typeof NS> & LoomSeat & PropsRenderFactories

type CatalogState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: CatalogSnapshot }

const frame: CSSProperties = { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-base)', fontSize: 13 }
const line: CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '12px 16px', borderBottom: '0.5px solid var(--dsw-alias-border-l4)' }
const side: CSSProperties = { minWidth: 160, flex: '0 1 220px', overflow: 'auto', padding: 16 }
const note: CSSProperties = { padding: 12, borderRadius: 8, color: 'var(--dsw-alias-label-secondary)', background: 'var(--dsw-alias-bg-layer-1)', lineHeight: 1.6 }
const button: CSSProperties = { color: 'inherit', background: 'transparent', border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', font: 'inherit' }
const sectionTitle: CSSProperties = { fontSize: 13, fontWeight: 500, margin: '12px 0' }
const bottomKeys = ['diff', 'terminal', 'tests', 'audit', 'costs'] as const

/** Render the native conversation inside an independently retained session scope.
 * @param props - Locale, native catalog, session acquisition, catalog reads, and renderer seats.
 * @returns Loom's workbench; unconnected capabilities stay labeled instead of showing mock data.
 */
export function LoomPanel({ t, useSessions, retainSession, loadSnapshot, createProject, createVersion, createTask, generateLock, prepareWorkspace, startAttempt, attachSession, transitionTask, createSessionInWorkspace, workspaceChanges, cleanupWorkspace, SessionProvider, renderSlot, renderFactorySlot }: LoomPanelProps) {
  const sessions = useSessions(state => state)
  const [selected, setSelected] = useState<SessionId>()
  const [held, setHeld] = useState<{ id: SessionId; reference: SessionReference }>()
  const [failure, setFailure] = useState<SessionId>()
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'workbench' | 'board'>('workbench')
  const [bottom, setBottom] = useState<typeof bottomKeys[number]>()
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [project, setProject] = useState<ProjectRecord['id']>()
  const [version, setVersion] = useState<VersionRecord['id']>()
  const [task, setTask] = useState<BoardTask>()
  useEffect(() => {
    let active = true
    setCatalog({ status: 'loading' })
    loadSnapshot().then((result) => {
      if (!active) return
      setCatalog(result.ok ? { status: 'ready', snapshot: result.value } : { status: 'error' })
    }, () => { if (active) setCatalog({ status: 'error' }) })
    return () => { active = false }
  }, [loadSnapshot, attempt])
  useEffect(() => {
    if (selected === undefined) return
    let reference: SessionReference
    try { reference = retainSession(selected) }
    catch (error) { setFailure(selected); return }
    let active = true
    setFailure(undefined)
    setHeld({ id: selected, reference })
    void reference.ready.catch((_error: unknown) => { if (active) setFailure(selected) })
    return () => { active = false; reference.release() }
  }, [selected, retainSession])
  const available = held !== undefined && held.id === selected && failure !== selected
  const currentProject = catalog.status === 'ready' ? catalog.snapshot.projects.find(candidate => candidate.id === project) : undefined
  const currentVersion = catalog.status === 'ready' ? catalog.snapshot.versions.find(candidate => candidate.id === version) : undefined
  const detailTask = task === undefined ? undefined : (catalog.status === 'ready' ? catalog.snapshot.tasks.find(candidate => candidate.id === task.id) ?? task : task)
  const refresh = () => setAttempt(current => current + 1)
  const execution: ExecutionActions = { prepareWorkspace, startAttempt, attachSession, transitionTask, createSessionInWorkspace, cleanupWorkspace, onChanged: refresh }
  const detailWorkspaceId = detailTask?.attempts.at(-1)?.workspaceId
  return <div style={frame}>
    <header style={line}>
      <span style={{ fontSize: 18, fontWeight: 500 }}>{t('panel')}</span>
      <button style={button} aria-pressed={view === 'workbench'} onClick={() => setView('workbench')}>{t('workbench')}</button>
      <button style={button} aria-pressed={view === 'board'} onClick={() => setView('board')}>{t('view.kanban')}</button>
    </header>
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'auto' }}>
      <aside style={{ ...side, borderRight: '0.5px solid var(--dsw-alias-border-l4)' }}>
        <h2 style={sectionTitle}>{t('project.title')}</h2>
        {catalog.status === 'loading' && <p style={note}>{t('state.loading')}</p>}
        {catalog.status === 'error' && <p role="alert" style={note}>{t('state.error')} <button style={{ ...button, marginTop: 8 }} onClick={() => setAttempt(current => current + 1)}>{t('form.retry')}</button></p>}
        {catalog.status === 'ready' && catalog.snapshot.projects.length === 0 && <p style={note}>{t('project.empty')}</p>}
        {catalog.status === 'ready' && catalog.snapshot.projects.map(project => <ProjectNode key={project.id} project={project}
          versions={catalog.snapshot.versions.filter(candidate => candidate.projectId === project.id)}
          locks={catalog.snapshot.locks} selected={version} onSelect={setVersion}
          selectedProject={currentProject?.id} onProject={id => { setProject(current => current === id ? undefined : id); setVersion(undefined) }} t={t} />)}
        {catalog.status === 'ready' && <>
          <ProjectForm t={t} create={createProject} onCreated={refresh} />
          {currentProject !== undefined && <VersionForm t={t} project={currentProject} create={createVersion} onCreated={refresh} />}
          {currentVersion !== undefined && <>
            <TaskForm t={t} version={currentVersion} create={createTask} onCreated={refresh} />
            <LockButton t={t} version={currentVersion} generate={generateLock} onCreated={refresh} />
          </>}
        </>}
        <h2 style={sectionTitle}>{t('sessions')}</h2>
        <input aria-label={t('searchSessions')} placeholder={t('searchSessions')} value={search} onChange={event => setSearch(event.target.value)} style={{ ...button, boxSizing: 'border-box', width: '100%', cursor: 'text' }} />
        {sessions.ids.length === 0 && <p style={note}>{t('noSessions')}</p>}
        {sessions.ids.filter(id => sessions.byId[id]?.displayTitle.toLowerCase().includes(search.toLowerCase())).map(id => <button key={id} aria-pressed={selected === id} style={{ ...button, display: 'block', textAlign: 'left', width: '100%', marginTop: 8, overflowWrap: 'anywhere', background: selected === id ? 'var(--dsw-alias-bg-layer-1)' : 'transparent' }} onClick={() => { setSelected(id); setView('workbench') }}>{sessions.byId[id]?.displayTitle || t('untitledSession')}</button>)}
      </aside>
      <main style={{ flex: '1 0 320px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {view === 'board'
          ? <div style={{ padding: 20, overflow: 'auto' }}>{catalog.status === 'ready'
            ? <TaskBoard tasks={catalog.snapshot.tasks} filter={boardFilter(version, search)} t={t} onSelect={setTask} />
            : <p style={note}>{t('state.loading')}</p>}</div>
          : <>
            <div style={line}>{t('unboundSession')}{selected !== undefined && <button style={{ ...button, marginLeft: 'auto' }} onClick={() => setSelected(undefined)}>{t('session.close')}</button>}</div>
            {failure !== undefined && failure === selected ? <p role="alert" style={{ ...note, margin: 20 }}>{t('session.unavailable')}</p> : available ? <SessionProvider key={held.id} session={held.reference}>{renderSlot('loom.conversation', {})}</SessionProvider> : <p style={{ ...note, margin: 20 }}>{t(selected === undefined ? 'chooseSession' : 'session.loading')}</p>}
          </>}
      </main>
      <aside style={{ ...side, borderLeft: '0.5px solid var(--dsw-alias-border-l4)' }}>
        <h2 style={sectionTitle}>{t('task.details')}</h2>
        {detailTask === undefined ? <p style={note}>{t('task.select')}</p> : <>
          <TaskDetails task={detailTask} t={t} />
          {catalog.status === 'ready' && <ExecutionPanel t={t} task={detailTask} snapshot={catalog.snapshot} selectedSession={selected} actions={execution} />}
        </>}
        <h2 style={sectionTitle}>{t('context')}</h2>
        {selected !== undefined && <p style={{ overflowWrap: 'anywhere' }}>{sessions.byId[selected]?.displayTitle ?? selected}</p>}
      </aside>
    </div>
    {bottom === 'diff' && <section style={{ ...note, borderRadius: 0, padding: 0 }} aria-label={t('diff')}><LoomDiff t={t} workspaceId={detailWorkspaceId} loadChanges={workspaceChanges} renderFactorySlot={renderFactorySlot} /></section>}
    {bottom !== undefined && bottom !== 'diff' && <section style={{ ...note, borderRadius: 0 }} aria-label={t(bottom)}>{t('integrationUnavailable')}</section>}
    <footer style={{ ...line, borderBottom: 0, borderTop: '0.5px solid var(--dsw-alias-border-l4)' }}>{bottomKeys.map(key => <button key={key} style={button} aria-expanded={bottom === key} onClick={() => setBottom(current => current === key ? undefined : key)}>{t(key)}</button>)}</footer>
  </div>
}

/** One project row with its versions and Lock availability. */
function ProjectNode({ project, versions, locks, selected, onSelect, selectedProject, onProject, t }: {
  project: ProjectRecord
  versions: readonly VersionRecord[]
  locks: CatalogSnapshot['locks']
  selected: VersionRecord['id'] | undefined
  onSelect(versionId: VersionRecord['id'] | undefined): void
  selectedProject: ProjectRecord['id'] | undefined
  onProject(projectId: ProjectRecord['id']): void
  t: LoomPanelProps['t']
}) {
  return <section>
    <button aria-pressed={selectedProject === project.id} style={{ ...button, border: 0, padding: 0, margin: '8px 0 4px', fontWeight: 500, textAlign: 'left', overflowWrap: 'anywhere', background: 'transparent' }} onClick={() => onProject(project.id)}>{project.config.name}</button>
    {versions.length === 0 && <p style={{ ...note, margin: 0 }}>{t('version.empty')}</p>}
    {versions.map(version => <button key={version.id} aria-pressed={selected === version.id} style={{ ...button, display: 'block', width: '100%', textAlign: 'left', marginTop: 6, overflowWrap: 'anywhere', background: selected === version.id ? 'var(--dsw-alias-bg-layer-1)' : 'transparent' }} onClick={() => onSelect(selected === version.id ? undefined : version.id)}>
      {version.name}{locks.some(lock => lock.versionId === version.id) ? ` · ${t('lock.title')}` : ''}
    </button>)}
  </section>
}

/** Build the board filter without optional properties holding undefined. */
function boardFilter(version: VersionRecord['id'] | undefined, search: string): BoardFilter {
  return { ...(version === undefined ? {} : { versionId: version }), ...(search.trim() === '' ? {} : { search }) }
}

const STATUS_KEY = {
  pending: 'task.status.pending',
  running: 'task.status.running',
  review: 'task.status.review',
  completed: 'task.status.completed',
  failed: 'task.status.failed',
} as const

/** Selected task business state and attempt history. */
function TaskDetails({ task, t }: { task: TaskRecord; t: LoomPanelProps['t'] }) {
  return <div style={{ lineHeight: 1.8 }}>
    <p style={{ margin: 0, fontWeight: 500, overflowWrap: 'anywhere' }}>{task.title}</p>
    <p style={{ margin: 0 }}>{t('task.status')}: {t(STATUS_KEY[task.status])}</p>
    <p style={{ margin: 0 }}>{t('attempt.title')}: {task.attempts.length}</p>
    <p>{t('task.humanOnly')}</p>
  </div>
}
