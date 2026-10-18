/** Loom workbench shell: project tree, native conversation, context and kanban. */
import { useEffect, useRef, useState } from 'react'
import { IconFolderCloseRegular, IconFolderOpenRegular, IconPinFillRegular, IconPinOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CSSProperties, ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRuntime, SessionProviderComponent } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AttachSessionRequest, CatalogSnapshot, CleanupWorkspaceRequest, CreateTaskRequest, CreateVersionRequest, GenerateLockRequest, Lock,
  PrepareWorkspaceRequest, ProjectConfig, ProjectRecord, StartAttemptRequest, TaskRecord, TransitionTaskRequest, VersionRecord,
  WorkspaceChangesRequest, WorkspaceRecord, WorkspaceRepositoryChangesRecord, ExecutionRequest, ReleaseExecutionRequest, ExecutionState,
} from 'dsh-loom/types'
import { ProjectForm, TaskForm, VersionForm } from './LoomForms.tsx'
import { ExecutionPanel, type ExecutionActions } from './LoomExecution.tsx'
import { LoomBottomPanel, type LoomBottomPane } from './LoomBottomPanel.tsx'
import { LoomContextPanel } from './LoomContextPanel.tsx'
import { LoomKanban, LoomKanbanAside } from './LoomKanban.tsx'
import { activeWorkspaceCount, boundSessions, currentWorkspace, recentSessions, workspaceName, type ShellFilter } from './projection.ts'
import { COLORS, metaLine, pill, select, shortCommit, STATUS_META } from './shell.ts'
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
  acquireExecution(request: ExecutionRequest): Promise<RemoteResult<ExecutionState>>
  releaseExecution(request: ReleaseExecutionRequest): Promise<RemoteResult<ExecutionState>>
  takeoverExecution(request: ExecutionRequest): Promise<RemoteResult<ExecutionState>>
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
type View = 'workbench' | 'kanban'
type CreateKind = 'project' | 'version' | 'task'

const frame: CSSProperties = { position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: COLORS.text, background: COLORS.bg, fontSize: 13, overflow: 'hidden' }
const topbar: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 12px', background: COLORS.panel, borderBottom: `0.5px solid ${COLORS.border}`, flex: 'none', position: 'relative', zIndex: 20 }
const sidebar: CSSProperties = { width: 230, flex: 'none', background: COLORS.panel, borderRight: `0.5px solid ${COLORS.border}`, overflowY: 'auto', padding: '8px 0' }
const center: CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: COLORS.bg }
const aside: CSSProperties = { width: 272, flex: 'none', display: 'flex', flexDirection: 'column', borderLeft: `0.5px solid ${COLORS.border}`, background: COLORS.panel }
const convHeader: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '9px 16px', borderBottom: `0.5px solid ${COLORS.border}`, minHeight: 40, flex: 'none' }
const note: CSSProperties = { padding: 12, borderRadius: 8, color: COLORS.dim, background: COLORS.panel2, lineHeight: 1.6, margin: 0 }

function TreeRow(props: { depth: number; active?: boolean; arrow?: string; icon?: ReactNode; badge?: string; label: string; color?: string; count?: string; onClick: () => void }) {
  const { depth, active, arrow, icon, badge, label, color, count, onClick } = props
  return <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left', background: active === true ? COLORS.panel3 : 'transparent', border: 'none', borderLeft: `2px solid ${active === true ? COLORS.accent : 'transparent'}`, padding: `5px 12px 5px ${String(14 + depth * 13)}px`, color: active === true ? COLORS.text : COLORS.dim, cursor: 'pointer', font: 'inherit', fontSize: depth === 2 ? 12 : 13 }}>
    {arrow !== undefined && <span style={{ fontSize: 9, color: COLORS.faint, width: 9 }}>{arrow}</span>}
    {icon !== undefined && <span>{icon}</span>}
    {badge !== undefined && <span style={{ fontSize: 10, color: COLORS.cyan, background: 'rgba(57,197,207,.12)', padding: '0 5px', borderRadius: 4 }}>{badge}</span>}
    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    {count !== undefined && <span style={{ marginLeft: 'auto', ...metaLine }}>{count}</span>}
    {color !== undefined && <span style={{ marginLeft: count === undefined ? 'auto' : 0, color, fontSize: 10 }}>●</span>}
  </button>
}

function PinButton({ pinned, label, onToggle }: { pinned: boolean; label: string; onToggle: () => void }) {
  return <button type="button" aria-label={label} aria-pressed={pinned} title={label} onClick={onToggle}
    style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, border: 'none', background: 'transparent', color: pinned ? COLORS.green : COLORS.faint, cursor: 'pointer', opacity: pinned ? 1 : 0.6 }}>
    {pinned ? <IconPinFillRegular size={14} /> : <IconPinOutlineRegular size={14} />}
  </button>
}

function ProjectItem({ candidate, versions, tasks, activeProject, activeVersionId, activeTaskId, open, openVersions, pinned, t, onProject, onVersion, onTask, onPin }: {
  candidate: ProjectRecord
  versions: VersionRecord[]
  tasks: TaskRecord[]
  activeProject: boolean
  activeVersionId: VersionRecord['id'] | undefined
  activeTaskId: TaskRecord['id'] | undefined
  open: boolean
  openVersions: ReadonlySet<string>
  pinned: boolean
  t: LoomPanelProps['t']
  onProject: () => void
  onVersion: (version: VersionRecord) => void
  onTask: (task: TaskRecord) => void
  onPin: () => void
}) {
  return <div>
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <TreeRow depth={0} arrow={open ? '▾' : '▸'} icon={open ? <IconFolderOpenRegular /> : <IconFolderCloseRegular />} label={candidate.config.name} active={activeProject} count={String(versions.length)} onClick={onProject} />
      </div>
      <PinButton pinned={pinned} label={pinned ? t('side.unpin') : t('side.pin')} onToggle={onPin} />
    </div>
    {open && versions.map(item => {
      const versionTasks = tasks.filter(candidateTask => candidateTask.versionId === item.id)
      const openVersion = openVersions.has(item.id)
      return <div key={item.id}>
        <TreeRow depth={1} arrow={openVersion ? '▾' : '▸'} badge={item.name} label="" active={activeVersionId === item.id} onClick={() => onVersion(item)} />
        {openVersion && versionTasks.map(itemTask => <TreeRow key={itemTask.id} depth={2} icon="💬" label={itemTask.title} active={activeTaskId === itemTask.id} color={itemTask.status === 'running' ? COLORS.green : COLORS.faint} onClick={() => onTask(itemTask)} />)}
        {openVersion && versionTasks.length === 0 && <p style={{ ...metaLine, padding: '2px 14px 2px 40px' }}>{t('task.empty')}</p>}
      </div>
    })}
  </div>
}

function readPinnedProjects(): ProjectRecord['id'][] {
  if (typeof localStorage === 'undefined') return []
  try {
    const value: unknown = JSON.parse(localStorage.getItem('loom.pinnedProjects') ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') as ProjectRecord['id'][] : []
  } catch { return [] }
}

/**
 * Render the Loom shell. Every card and counter comes from the Host catalog; unwired
 * integrations stay labeled instead of showing mock data.
 * @param props - locale, native catalog, session acquisition, catalog actions, and renderer seats.
 * @returns the whole Loom page.
 */
export function LoomPanel({ t, useSessions, retainSession, loadSnapshot, createProject, createVersion, createTask, generateLock, prepareWorkspace, startAttempt, attachSession, transitionTask, createSessionInWorkspace, workspaceChanges, cleanupWorkspace, acquireExecution, releaseExecution, takeoverExecution, SessionProvider, renderSlot, renderFactorySlot }: LoomPanelProps) {
  const sessions = useSessions(state => state)
  const [view, setView] = useState<View>('workbench')
  const [project, setProject] = useState<ProjectRecord['id']>()
  const [version, setVersion] = useState<VersionRecord['id']>()
  const [task, setTask] = useState<TaskRecord>()
  const [selected, setSelected] = useState<SessionId>()
  const [dismissed, setDismissed] = useState<TaskRecord['id']>()
  const [pinnedProjects, setPinnedProjects] = useState<ProjectRecord['id'][]>(readPinnedProjects)
  const [held, setHeld] = useState<{ id: SessionId; reference: SessionReference }>()
  const heldRef = useRef<{ id: SessionId; reference: SessionReference } | undefined>(undefined)
  const [failure, setFailure] = useState<SessionId>()
  const [search, setSearch] = useState('')
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [asideOpen, setAsideOpen] = useState(true)
  const [bottomCollapsed, setBottomCollapsed] = useState(true)
  const [pane, setPane] = useState<LoomBottomPane>('diff')
  const [diffCount, setDiffCount] = useState(0)
  const [kbMode, setKbMode] = useState<'flat' | 'grouped'>('grouped')
  const [filterProject, setFilterProject] = useState('')
  const [filterVersion, setFilterVersion] = useState('')
  const [kbSearch, setKbSearch] = useState('')
  const [expandedProjects, setExpandedProjects] = useState<ReadonlySet<string>>(new Set())
  const [expandedVersions, setExpandedVersions] = useState<ReadonlySet<string>>(new Set())
  const [create, setCreate] = useState<CreateKind>()
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    try { localStorage.setItem('loom.pinnedProjects', JSON.stringify(pinnedProjects)) } catch { /* Storage can be unavailable in private browsing; pins remain in memory. */ }
  }, [pinnedProjects])
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
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void loadSnapshot().then((result) => {
        if (result.ok) setCatalog({ status: 'ready', snapshot: result.value })
      }, () => undefined)
    }, 5000)
    return () => { window.clearInterval(timer) }
  }, [loadSnapshot])
  useEffect(() => {
    if (selected === undefined) return
    let reference: SessionReference
    try { reference = retainSession(selected) }
    catch { setFailure(selected); return }
    let active = true
    setFailure(undefined)
    heldRef.current = { id: selected, reference }
    setHeld({ id: selected, reference })
    void reference.ready.catch(() => { if (active) setFailure(selected) })
    return () => {
      active = false
      if (heldRef.current?.reference === reference) heldRef.current = undefined
      reference.release()
    }
  }, [selected, retainSession])
  useEffect(() => {
    if (task === undefined || selected !== undefined || dismissed === task.id || catalog.status !== 'ready') return
    const record = catalog.snapshot.tasks.find(candidate => candidate.id === task.id)
    const bound = record?.attempts.at(-1)?.sessionIds.at(-1)
    if (bound !== undefined) setSelected(bound)
  }, [task, selected, dismissed, catalog])
  const snapshot = catalog.status === 'ready' ? catalog.snapshot : undefined
  const currentProject = snapshot?.projects.find(candidate => candidate.id === project)
  const currentVersion = snapshot?.versions.find(candidate => candidate.id === version)
  const boundRows = snapshot === undefined ? [] : boundSessions(snapshot)
  const boundIds = new Set(boundRows.map(row => row.sessionId))
  const looseSessions = recentSessions(sessions.ids.map(id => sessions.byId[id]).filter(row => row !== undefined), boundIds, search)
  const detailTask = task === undefined ? undefined : snapshot?.tasks.find(candidate => candidate.id === task.id) ?? task
  const taskVersion = detailTask === undefined || snapshot === undefined ? undefined : snapshot.versions.find(candidate => candidate.id === detailTask.versionId)
  const displayProject = currentProject ?? (taskVersion === undefined ? undefined : snapshot?.projects.find(candidate => candidate.id === taskVersion.projectId))
  const displayVersion = currentVersion ?? taskVersion
  const detailWorkspace = snapshot === undefined ? undefined : currentWorkspace(snapshot, detailTask)
  useEffect(() => {
    if (detailWorkspace?.id === undefined || detailWorkspace.cleaned === true) { setDiffCount(0); return }
    let active = true
    workspaceChanges({ workspaceId: detailWorkspace.id }).then((result) => {
      if (active) setDiffCount(result.ok ? result.value.repositories.reduce((total, repository) => total + repository.files.length, 0) : 0)
    }, () => { if (active) setDiffCount(0) })
    return () => { active = false }
  }, [detailWorkspace?.id, detailWorkspace?.cleaned, attempt, workspaceChanges])
  const activeCount = snapshot === undefined ? 0 : activeWorkspaceCount(snapshot)
  const auditWorkspaceIds = new Set<string>((detailTask?.attempts ?? []).map(candidate => candidate.workspaceId))
  const auditRows = snapshot === undefined ? [] : snapshot.audit.filter(entry => detailTask === undefined
    || entry.taskId === detailTask.id
    || (entry.workspaceId !== undefined && auditWorkspaceIds.has(entry.workspaceId))).slice(-40).reverse()
  const available = held !== undefined && held.id === selected && failure !== selected && heldRef.current?.reference === held.reference
  const execution: ExecutionActions = {
    prepareWorkspace, startAttempt, attachSession, transitionTask, createSessionInWorkspace, cleanupWorkspace, acquireExecution, releaseExecution, takeoverExecution,
    onSession: id => { setSelected(id); setView('workbench') },
    onChanged: () => setAttempt(current => current + 1),
  }
  const selectTask = (record: TaskRecord): void => {
    if (snapshot !== undefined) {
      const owner = snapshot.versions.find(candidate => candidate.id === record.versionId)
      if (owner !== undefined) { setProject(owner.projectId); setVersion(owner.id) }
    }
    setDismissed(undefined)
    setTask(record)
    setSelected(record.attempts.at(-1)?.sessionIds.at(-1))
    setView('workbench')
  }
  const selectSession = (id: SessionId, owner?: TaskRecord): void => {
    if (owner !== undefined) setTask(owner)
    setSelected(id); setView('workbench')
  }
  const toggle = (set: ReadonlySet<string>, apply: (next: ReadonlySet<string>) => void, id: string): void => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    apply(next)
  }
  async function transition(target: TransitionTaskRequest['target'], actor: TransitionTaskRequest['actor']): Promise<void> {
    if (detailTask === undefined) return
    try {
      const result = await transitionTask({ taskId: detailTask.id, target, actor })
      if (result.ok) setAttempt(current => current + 1)
    } catch { /* the next snapshot keeps the authoritative status */ }
  }
  function openCreate(kind: CreateKind): void { setCreate(kind); setMenuOpen(false) }
  const selectedSessionTitle = selected === undefined ? undefined : sessions.byId[selected]?.displayTitle
  const headerTitle = detailTask?.title ?? selectedSessionTitle ?? t('conv.titleFallback')
  const filter: ShellFilter = {
    ...(filterProject === '' ? {} : { projectId: filterProject as ProjectRecord['id'] }),
    ...(filterVersion === '' ? {} : { versionId: filterVersion as VersionRecord['id'] }),
    ...(kbSearch.trim() === '' ? {} : { search: kbSearch }),
  }
  const createVersionFor = (projectRecord: ProjectRecord): VersionRecord | undefined => snapshot?.versions.filter(candidate => candidate.projectId === projectRecord.id).at(-1)
  const createDisabledVersion = currentProject === undefined
  const createDisabledTask = currentVersion === undefined
  return <div style={frame}>
    <header style={topbar}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 14 }}>
        <span style={{ width: 20, height: 20, borderRadius: 5, background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.purple})`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff' }}>织</span>
        {t('brand')}
      </span>
      <label style={{ ...pill, padding: '3px 8px', background: COLORS.panel2 }}>
        <span style={metaLine}>{t('top.project')}</span>
        <select aria-label={t('top.project')} value={project ?? ''} onChange={(event) => { const next = event.target.value; setProject(next === '' ? undefined : next as ProjectRecord['id']); setVersion(undefined); setTask(undefined); setSelected(undefined) }} style={{ background: 'transparent', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
          <option value="">{t('top.allProjects')}</option>
          {(snapshot?.projects ?? []).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.config.name}</option>)}
        </select>
      </label>
      <label style={{ ...pill, padding: '3px 8px', background: COLORS.panel2 }}>
        <span style={metaLine}>{t('top.version')}</span>
        <select aria-label={t('top.version')} value={version ?? ''} onChange={(event) => {
          const next = event.target.value
          if (next === '') { setVersion(undefined); setTask(undefined); setSelected(undefined); return }
          const owner = snapshot?.versions.find(candidate => candidate.id === next)
          if (owner !== undefined) setProject(owner.projectId)
          setVersion(next as VersionRecord['id']); setTask(undefined); setSelected(undefined)
        }} style={{ background: 'transparent', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
          <option value="">{t('top.allVersions')}</option>
          {(snapshot?.versions ?? []).filter(candidate => project === undefined || candidate.projectId === project).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </select>
      </label>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: COLORS.dim, fontSize: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: COLORS.green, boxShadow: `0 0 6px ${COLORS.green}` }} />
        {activeCount} {t('top.activeWorkspaces')}
      </span>
      <div style={{ display: 'flex', border: `0.5px solid ${COLORS.border}`, borderRadius: 7, overflow: 'hidden' }}>
        <button type="button" aria-pressed={view === 'workbench'} onClick={() => setView('workbench')} style={{ background: view === 'workbench' ? COLORS.panel3 : 'none', border: 'none', color: view === 'workbench' ? COLORS.text : COLORS.dim, padding: '5px 14px', cursor: 'pointer', fontSize: 12, fontWeight: view === 'workbench' ? 600 : 400 }}>{t('workbench')}</button>
        <button type="button" aria-pressed={view === 'kanban'} onClick={() => setView('kanban')} style={{ background: view === 'kanban' ? COLORS.panel3 : 'none', border: 'none', color: view === 'kanban' ? COLORS.text : COLORS.dim, padding: '5px 14px', cursor: 'pointer', fontSize: 12, fontWeight: view === 'kanban' ? 600 : 400 }}>{t('view.kanban')}</button>
      </div>
      <span style={{ flex: 1 }} />
      <div style={{ position: 'relative' }}>
        <button type="button" aria-label={t('top.new')} aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: COLORS.accent, color: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>＋</button>
        {menuOpen && <div style={{ position: 'absolute', top: 32, right: 0, width: 160, background: COLORS.panel2, border: `0.5px solid ${COLORS.border}`, borderRadius: 8, padding: 4, display: 'flex', flexDirection: 'column', zIndex: 40, boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}>
          <button type="button" style={{ ...select, border: 'none', textAlign: 'left', padding: '7px 8px' }} onClick={() => openCreate('project')}>{t('top.newProject')}</button>
          <button type="button" style={{ ...select, border: 'none', textAlign: 'left', padding: '7px 8px', opacity: createDisabledVersion ? 0.45 : 1 }} disabled={createDisabledVersion} onClick={() => openCreate('version')}>{t('top.newVersion')}</button>
          <button type="button" style={{ ...select, border: 'none', textAlign: 'left', padding: '7px 8px', opacity: createDisabledTask ? 0.45 : 1 }} disabled={createDisabledTask} onClick={() => openCreate('task')}>{t('top.newTask')}</button>
        </div>}
      </div>
      <button type="button" aria-label={t('top.settings')} aria-pressed={asideOpen} onClick={() => setAsideOpen(value => !value)} style={{ width: 28, height: 28, borderRadius: 6, border: `0.5px solid ${COLORS.border}`, background: COLORS.panel2, color: COLORS.dim, cursor: 'pointer', fontSize: 14 }}>⚙</button>
    </header>
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <aside style={sidebar}>
        <section style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px 4px', ...metaLine, fontWeight: 600 }}><IconPinFillRegular size={13} /> {t('side.pinned')}</div>
          {(snapshot?.projects ?? []).filter(candidate => pinnedProjects.includes(candidate.id)).length === 0 && <p style={{ ...metaLine, padding: '2px 14px 6px' }}>{t('side.pinHint')}</p>}
          {(snapshot?.projects ?? []).filter(candidate => pinnedProjects.includes(candidate.id)).map(candidate => <ProjectItem
            key={candidate.id}
            candidate={candidate}
            versions={(snapshot?.versions ?? []).filter(item => item.projectId === candidate.id)}
            tasks={snapshot?.tasks ?? []}
            activeProject={project === candidate.id}
            activeVersionId={task === undefined ? version : undefined}
            activeTaskId={task?.id}
            open={expandedProjects.has(candidate.id)}
            openVersions={expandedVersions}
            pinned
            t={t}
            onProject={() => { setProject(candidate.id); setVersion(undefined); setTask(undefined); toggle(expandedProjects, setExpandedProjects, candidate.id) }}
            onVersion={item => { setProject(candidate.id); setVersion(item.id); setTask(undefined); toggle(expandedVersions, setExpandedVersions, item.id) }}
            onTask={selectTask}
            onPin={() => setPinnedProjects(current => current.filter(id => id !== candidate.id))}
          />)}
        </section>
        <section style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px 4px', ...metaLine, fontWeight: 600 }}>{t('side.projects')} <span style={{ marginLeft: 'auto', fontWeight: 400 }}>{String(snapshot?.projects.length ?? 0)}</span></div>
          {(snapshot?.projects ?? []).map(candidate => <ProjectItem
            key={candidate.id}
            candidate={candidate}
            versions={(snapshot?.versions ?? []).filter(item => item.projectId === candidate.id)}
            tasks={snapshot?.tasks ?? []}
            activeProject={project === candidate.id}
            activeVersionId={task === undefined ? version : undefined}
            activeTaskId={task?.id}
            open={expandedProjects.has(candidate.id)}
            openVersions={expandedVersions}
            pinned={pinnedProjects.includes(candidate.id)}
            t={t}
            onProject={() => { setProject(candidate.id); setVersion(undefined); setTask(undefined); toggle(expandedProjects, setExpandedProjects, candidate.id) }}
            onVersion={item => { setProject(candidate.id); setVersion(item.id); setTask(undefined); toggle(expandedVersions, setExpandedVersions, item.id) }}
            onTask={selectTask}
            onPin={() => setPinnedProjects(current => current.includes(candidate.id) ? current.filter(id => id !== candidate.id) : [...current, candidate.id])}
          />)}
          <button type="button" style={{ margin: '6px 12px', display: 'block', width: 'calc(100% - 24px)', textAlign: 'center', padding: 5, border: `1px dashed ${COLORS.border}`, borderRadius: 6, background: 'transparent', color: COLORS.faint, fontSize: 12, cursor: 'pointer' }} onClick={() => openCreate('project')}>＋ {t('side.newProject')}</button>
        </section>
        <section style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px 4px', ...metaLine, fontWeight: 600 }}>{t('side.tasks')}<span style={{ marginLeft: 'auto', fontWeight: 400 }}>{t('side.recent')}</span></div>
          {looseSessions.length === 0 && <p style={{ ...metaLine, padding: '2px 14px 6px' }}>{t('side.empty')}</p>}
          {looseSessions.map(row => {
            const workspace = workspaceName(row.cwd)
            const active = selected === row.id
            return <button key={row.id} type="button" title={row.cwd} onClick={() => { setSelected(row.id as SessionId); setDismissed(undefined); setTask(undefined); setView('workbench') }}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 7, width: '100%', textAlign: 'left', background: active ? COLORS.panel3 : 'transparent', border: 'none', borderLeft: `2px solid ${active ? COLORS.accent : 'transparent'}`, padding: '5px 12px 5px 27px', color: active ? COLORS.text : COLORS.dim, cursor: 'pointer', font: 'inherit' }}>
              <span style={{ fontSize: 12 }}>💬</span>
              <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title || t('untitledSession')}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: COLORS.faint }}>
                  {workspace !== undefined && <span style={{ color: COLORS.cyan, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📁 {workspace}</span>}
                  {row.running && <span style={{ color: COLORS.green }}>●</span>}
                  {active && <span style={{ color: COLORS.accent }}>{t('session.current')}</span>}
                </span>
              </span>
            </button>
          })}
          <input aria-label={t('searchSessions')} placeholder={t('searchSessions')} value={search} onChange={event => setSearch(event.target.value)} style={{ ...select, cursor: 'text', width: 'calc(100% - 24px)', margin: '2px 12px 6px', boxSizing: 'border-box' }} />
          <button type="button" style={{ margin: '2px 12px 8px', display: 'block', width: 'calc(100% - 24px)', textAlign: 'center', padding: 5, border: `1px dashed ${COLORS.border}`, borderRadius: 6, background: 'transparent', color: COLORS.faint, fontSize: 12, cursor: createDisabledTask ? 'not-allowed' : 'pointer', opacity: createDisabledTask ? 0.5 : 1 }} disabled={createDisabledTask} onClick={() => openCreate('task')}>＋ {t('side.newTask')}</button>
        </section>
      </aside>
      {view === 'kanban'
        ? <LoomKanban
            t={t}
            snapshot={snapshot ?? { projects: [], versions: [], locks: [], tasks: [], workspaces: [], audit: [], executions: [] }}
            filter={filter}
            mode={kbMode}
            projectValue={filterProject}
            versionValue={filterVersion}
            searchValue={kbSearch}
            onMode={setKbMode}
            onProject={(value) => { setFilterProject(value); setFilterVersion('') }}
            onVersion={setFilterVersion}
            onSearch={setKbSearch}
            onSelect={selectTask}
            onNewCard={(projectRecord) => {
              const latest = createVersionFor(projectRecord)
              setProject(projectRecord.id)
              if (latest !== undefined) { setVersion(latest.id); setCreate('task') }
            }}
          />
        : <main style={center}>
            <div style={convHeader}>
              <span style={{ fontWeight: 700, fontSize: 13, overflowWrap: 'anywhere' }}>{headerTitle}</span>
              {displayProject !== undefined && <span style={{ ...pill, color: '#7db3ff', borderColor: 'rgba(47,129,247,.45)' }}>{displayProject.config.name}</span>}
              {displayVersion !== undefined && <span style={{ ...pill, color: COLORS.cyan, borderColor: 'rgba(57,197,207,.4)' }}>{displayVersion.name}</span>}
              {displayProject?.config.modules.slice(0, 2).map(module => <span key={module.id} style={pill}>{module.id}</span>)}
              {shortCommit(detailTask?.attempts.at(-1)?.lock) !== undefined && <span style={pill}>🔒 {shortCommit(detailTask?.attempts.at(-1)?.lock)}</span>}
              {detailTask !== undefined && <span style={pill}>{t('task.status')}: {t(STATUS_META[detailTask.status].key)}</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {detailTask?.status === 'running' && <>
                  <button style={select} onClick={() => { void transition('review', 'agent') }}>{t('task.review')}</button>
                  <button style={select} onClick={() => { void transition('failed', 'human') }}>{t('task.fail')}</button>
                </>}
                {detailTask?.status === 'review' && <>
                  <button style={select} onClick={() => { void transition('completed', 'human') }}>{t('task.accept')}</button>
                  <button style={select} onClick={() => { void transition('running', 'human') }}>{t('task.continue')}</button>
                  <button style={select} onClick={() => { void transition('failed', 'human') }}>{t('task.fail')}</button>
                </>}
                {selected !== undefined && <button style={select} onClick={() => { setDismissed(detailTask?.id); setSelected(undefined) }}>{t('session.close')}</button>}
              </span>
            </div>
            {selected !== undefined
              ? (available
                  ? <SessionProvider key={held.id} session={held.reference}>{renderSlot('loom.conversation', {})}</SessionProvider>
                  : failure === selected
                    ? <p role="alert" style={{ ...note, margin: 20 }}>{t('session.unavailable')}</p>
                    : <p style={{ ...note, margin: 20 }}>{t('session.loading')}</p>)
              : detailTask !== undefined
                ? <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
                    <div style={{ maxWidth: 720, margin: '0 auto', background: COLORS.panel2, border: `0.5px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
                      <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>{detailTask.title}</h3>
                      {snapshot !== undefined && <ExecutionPanel t={t} task={detailTask} snapshot={snapshot} selectedSession={selected} actions={execution} />}
                    </div>
                  </div>
                : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <div style={{ maxWidth: 380, textAlign: 'center', color: COLORS.dim }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>🧶</div>
                      <p style={{ margin: '0 0 6px', fontWeight: 600, color: COLORS.text }}>{t('conv.titleFallback')}</p>
                      <p style={{ ...note, margin: '0 0 12px' }}>{t('chooseTask')}</p>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button style={select} onClick={() => openCreate('project')}>＋ {t('top.newProject')}</button>
                        <button style={select} disabled={createDisabledTask} onClick={() => openCreate('task')}>＋ {t('top.newTask')}</button>
                      </div>
                    </div>
                  </div>}
          </main>}
      {asideOpen && <aside style={aside}>
        {view === 'kanban'
          ? snapshot !== undefined && <LoomKanbanAside t={t} snapshot={snapshot} filter={filter} onSelectSession={(id) => { const row = boundRows.find(candidate => candidate.sessionId === id); selectSession(id as SessionId, row?.task) }} />
          : <LoomContextPanel t={t} snapshot={snapshot ?? { projects: [], versions: [], locks: [], tasks: [], workspaces: [], audit: [], executions: [] }} project={displayProject} version={displayVersion} task={detailTask} generateLock={generateLock} onLockChanged={() => setAttempt(current => current + 1)} />}
      </aside>}
    </div>
    <LoomBottomPanel
      t={t}
      collapsed={bottomCollapsed}
      pane={pane}
      audit={auditRows}
      diffCount={diffCount}
      workspaceId={detailWorkspace?.id}
      loadChanges={workspaceChanges}
      renderFactorySlot={renderFactorySlot}
      onToggle={() => setBottomCollapsed(value => !value)}
      onPane={setPane}
    />
    {create !== undefined && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', justifyContent: 'flex-end', zIndex: 60 }} onClick={() => setCreate(undefined)}>
      <div style={{ width: 380, maxWidth: '92%', height: '100%', background: COLORS.panel, borderLeft: `0.5px solid ${COLORS.border}`, padding: 16, overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ fontSize: 14 }}>{create === 'project' ? t('top.newProject') : create === 'version' ? t('top.newVersion') : t('top.newTask')}</strong>
          <button type="button" style={{ ...select, marginLeft: 'auto' }} onClick={() => setCreate(undefined)}>{t('form.close')}</button>
        </div>
        {create === 'project' && <ProjectForm t={t} open onOpenChange={value => { if (!value) setCreate(undefined) }} create={createProject} onCreated={created => { setProject(created.id); setVersion(undefined); setTask(undefined); setSelected(undefined); setCreate(undefined); setAttempt(current => current + 1) }} />}
        {create === 'version' && currentProject !== undefined && <VersionForm t={t} open onOpenChange={value => { if (!value) setCreate(undefined) }} project={currentProject} create={createVersion} onCreated={created => { setVersion(created.id); setTask(undefined); setSelected(undefined); setCreate(undefined); setAttempt(current => current + 1) }} />}
        {create === 'task' && currentVersion !== undefined && <TaskForm t={t} open onOpenChange={value => { if (!value) setCreate(undefined) }} version={currentVersion} create={createTask} onCreated={created => { setTask(created); setView('workbench'); setCreate(undefined); setAttempt(current => current + 1) }} />}
        {create === 'version' && currentProject === undefined && <p style={note}>{t('project.select')}</p>}
        {create === 'task' && currentVersion === undefined && <p style={note}>{t('version.select')}</p>}
      </div>
    </div>}
  </div>
}
