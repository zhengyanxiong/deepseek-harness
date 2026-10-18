/** Loom workbench shell: project tree, native conversation, context and kanban. */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  IconCloseOutlineRegular, IconFolderCloseRegular, IconFolderOpenRegular, IconPanelLeftOutlineRegular, IconPinFillRegular, IconPinOutlineRegular,
  IconPlusOutlineRegular, IconSettingsOutlineRegular, Button, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { CSSProperties, ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRuntime, SessionProviderComponent } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceFileText } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AttachSessionRequest, CatalogSnapshot, CleanupWorkspaceRequest, CreateTaskRequest, CreateVersionRequest, GenerateLockRequest, Lock,
  PrepareWorkspaceRequest, ProjectConfig, ProjectRecord, StartAttemptRequest, TaskPriority, TaskRecord, TransitionTaskRequest, VersionRecord,
  WorkspaceChangesRequest, WorkspaceRecord, WorkspaceRepositoryChangesRecord, ExecutionRequest, ReleaseExecutionRequest, ExecutionState,
  UpdateProjectRequest, UpdateVersionRequest, UpdateTaskRequest, DeleteProjectRequest, DeleteVersionRequest, DeleteTaskRequest,
} from 'dsh-workloom/types'
import { ImportProjectForm, ProjectForm, TaskForm, VersionForm } from './LoomForms.tsx'
import { LoomSettings, readPreferences, writePreferences, type LoomPreferences } from './LoomSettings.tsx'
import { ExecutionPanel, type ExecutionActions } from './LoomExecution.tsx'
import { LoomBottomPanel, type LoomBottomPane } from './LoomBottomPanel.tsx'
import { LoomResizeHandle } from './LoomResizeHandle.tsx'
import { LoomFilePreview } from './LoomFilePreview.tsx'
import { LoomReviewPreview } from './LoomReviewPreview.tsx'
import { openFilePreview, workspacePreview, workspaceReviewPreview } from './preview.ts'
import { LoomContextPanel } from './LoomContextPanel.tsx'
import { LoomKanban, LoomKanbanAside } from './LoomKanban.tsx'
import { activeWorkspaceCount, aggregateTokenUsage, boundSessions, currentWorkspace, taskSessionRows, workspaceName, type ShellFilter } from './projection.ts'
import { COLORS, metaLine, pill, select, shortCommit, PRIORITY_META, STATUS_META } from './shell.ts'
import { NS } from './locales.ts'

/** Host catalog access owned by the registration context. */
export interface LoomInjected {
  retainSession(id: SessionId): SessionReference
  loadSnapshot(): Promise<RemoteResult<CatalogSnapshot>>
  createProject(request: ProjectConfig): Promise<RemoteResult<ProjectRecord>>
  updateProject(request: UpdateProjectRequest): Promise<RemoteResult<ProjectRecord>>
  deleteProject(request: DeleteProjectRequest): Promise<RemoteResult<void>>
  createVersion(request: CreateVersionRequest): Promise<RemoteResult<VersionRecord>>
  updateVersion(request: UpdateVersionRequest): Promise<RemoteResult<VersionRecord>>
  deleteVersion(request: DeleteVersionRequest): Promise<RemoteResult<void>>
  createTask(request: CreateTaskRequest): Promise<RemoteResult<TaskRecord>>
  updateTask(request: UpdateTaskRequest): Promise<RemoteResult<TaskRecord>>
  deleteTask(request: DeleteTaskRequest): Promise<RemoteResult<void>>
  generateLock(request: GenerateLockRequest): Promise<RemoteResult<Lock>>
  prepareWorkspace(request: PrepareWorkspaceRequest): Promise<RemoteResult<WorkspaceRecord>>
  startAttempt(request: StartAttemptRequest): Promise<RemoteResult<TaskRecord>>
  attachSession(request: AttachSessionRequest): Promise<RemoteResult<TaskRecord>>
  transitionTask(request: TransitionTaskRequest): Promise<RemoteResult<TaskRecord>>
  createSessionInWorkspace(path: string): Promise<SessionId>
  workspaceChanges(request: WorkspaceChangesRequest): Promise<RemoteResult<{ repositories: WorkspaceRepositoryChangesRecord[] }>>
  readFile(sessionId: SessionId, path: string, offset: number, signal: AbortSignal): Promise<RemoteResult<WorkspaceFileText>>
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
type CreateKind = 'project' | 'import' | 'version' | 'task'
type EditKind = 'project' | 'version' | 'task'

const frame: CSSProperties = { position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: COLORS.text, background: COLORS.bg, fontSize: 13, overflow: 'hidden' }
const topbar: CSSProperties = {
  display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 8, rowGap: 6, minHeight: 48, padding: '0 12px',
  background: COLORS.panel, borderBottom: `0.5px solid ${COLORS.border}`, flex: 'none', position: 'relative', zIndex: 20,
}
const topBrand: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, flex: 'none', fontWeight: 500, fontSize: 13.5 }
const topDivider: CSSProperties = { width: 1, height: 18, background: COLORS.border, flex: 'none' }
const topContext: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 8px',
  border: `0.5px solid ${COLORS.border}`, borderRadius: 7, background: COLORS.panel2, color: COLORS.dim, whiteSpace: 'nowrap',
}
const topContextLabel: CSSProperties = { ...metaLine, fontSize: 10.5, flex: 'none' }
const topSelect: CSSProperties = { minWidth: 0, background: 'transparent', border: 'none', color: COLORS.text, font: 'inherit', fontSize: 12, cursor: 'pointer', padding: 0 }
const topActivity: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 9px', flex: 'none',
  border: `0.5px solid ${COLORS.border}`, borderRadius: 7, background: COLORS.panel2, color: COLORS.dim, fontSize: 11.5, whiteSpace: 'nowrap',
}
const topViewSwitch: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 2, height: 30, padding: 2, flex: 'none', border: `0.5px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.panel2 }
const topViewButton: CSSProperties = { height: 24, padding: '0 12px', border: 'none', borderRadius: 6, background: 'transparent', color: COLORS.dim, cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 400 }
const topAction: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, padding: 0,
  border: `0.5px solid ${COLORS.border}`, borderRadius: 7, background: COLORS.panel2, color: COLORS.dim, cursor: 'pointer',
}
const topActionActive: CSSProperties = { background: COLORS.panel3, borderColor: COLORS.borderStrong, color: COLORS.text }
const topNew: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: 30, padding: '0 10px',
  border: 'none', borderRadius: 7, background: COLORS.accent, color: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 500,
}
const topActions: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }
const topSpacer: CSSProperties = { flex: 1, minWidth: 8 }
const menuItem: CSSProperties = { ...select, border: 'none', textAlign: 'left', padding: '7px 8px', fontSize: 12 }
const topMenu: CSSProperties = { position: 'absolute', top: 36, right: 0, width: 210, background: COLORS.panel2, border: `0.5px solid ${COLORS.border}`, borderRadius: 8, padding: 4, display: 'flex', flexDirection: 'column', zIndex: 40, boxShadow: '0 8px 24px rgba(0,0,0,.35)' }
const sidebar: CSSProperties = { width: 230, flex: 'none', background: COLORS.panel, borderRight: `0.5px solid ${COLORS.border}`, overflowY: 'auto', padding: '8px 0' }
const center: CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: COLORS.bg }
const aside: CSSProperties = { width: 272, flex: 'none', display: 'flex', flexDirection: 'column', borderLeft: `0.5px solid ${COLORS.border}`, background: COLORS.panel }
const drawer: CSSProperties = { width: 380, maxWidth: '92%', height: '100%', background: COLORS.panel, borderLeft: `0.5px solid ${COLORS.border}`, borderRadius: 'var(--dsw-radius-lg) 0 0 var(--dsw-radius-lg)', boxShadow: '-16px 0 48px rgba(0,0,0,.18)', padding: '16px 16px 20px', overflowY: 'auto' }
const drawerHeader: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 28, marginBottom: 14 }
const drawerTitle: CSSProperties = { fontSize: 14, fontWeight: 500 }
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
export function LoomPanel({ t, useSessions, retainSession, loadSnapshot, createProject, updateProject, deleteProject, createVersion, updateVersion, deleteVersion, createTask, updateTask, deleteTask, generateLock, prepareWorkspace, startAttempt, attachSession, transitionTask, createSessionInWorkspace, workspaceChanges, readFile, cleanupWorkspace, acquireExecution, releaseExecution, takeoverExecution, SessionProvider, renderSlot, renderFactorySlot }: LoomPanelProps) {
  const sessions = useSessions(state => state)
  const [preferences, setPreferences] = useState<LoomPreferences>(readPreferences)
  const [view, setView] = useState<View>(preferences.view)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 940)
  const [viewport, setViewport] = useState(() => ({ width: typeof window === 'undefined' ? 1440 : window.innerWidth, height: typeof window === 'undefined' ? 900 : window.innerHeight }))
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
  const [asideOpen, setAsideOpen] = useState(preferences.contextOpen)
  const [bottomCollapsed, setBottomCollapsed] = useState(true)
  const [pane, setPane] = useState<LoomBottomPane>('diff')
  const [diffCount, setDiffCount] = useState(0)
  const preview = useSyncExternalStore(workspacePreview.subscribe, workspacePreview.getSnapshot, workspacePreview.getSnapshot)
  const review = useSyncExternalStore(workspaceReviewPreview.subscribe, workspaceReviewPreview.getSnapshot, workspaceReviewPreview.getSnapshot)
  const [kbMode, setKbMode] = useState<'flat' | 'grouped'>(preferences.kanbanMode)
  const [filterProject, setFilterProject] = useState('')
  const [filterVersion, setFilterVersion] = useState('')
  const [filterPriority, setFilterPriority] = useState<TaskPriority | ''>('')
  const [filterModule, setFilterModule] = useState('')
  const [kbSearch, setKbSearch] = useState('')
  const [expandedProjects, setExpandedProjects] = useState<ReadonlySet<string>>(new Set())
  const [expandedVersions, setExpandedVersions] = useState<ReadonlySet<string>>(new Set())
  const [create, setCreate] = useState<CreateKind>()
  const [edit, setEdit] = useState<EditKind>()
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    const timeout = setTimeout(() => writePreferences(preferences), 120)
    return () => clearTimeout(timeout)
  }, [preferences])
  useEffect(() => {
    const resize = (): void => {
      setNarrow(window.innerWidth <= 940)
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => { setSidebarOpen(false) }, [project, version, task])
  useEffect(() => { if (preview !== undefined || review !== undefined) setAsideOpen(true) }, [preview, review])
  useEffect(() => { workspacePreview.close(); workspaceReviewPreview.close() }, [task?.id])
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
  const currentVersionProject = snapshot?.projects.find(candidate => candidate.id === currentVersion?.projectId)
  const boundRows = snapshot === undefined ? [] : boundSessions(snapshot)
  const boundIds = new Set(boundRows.map(row => row.sessionId))
  const taskSessionCandidates = [...boundIds]
    .map(id => sessions.byId[id as SessionId])
    .filter(row => row !== undefined)
  const taskSessionList = snapshot === undefined ? [] : taskSessionRows(taskSessionCandidates, boundIds, search)
  const detailTask = task === undefined ? undefined : snapshot?.tasks.find(candidate => candidate.id === task.id) ?? task
  const taskVersion = detailTask === undefined || snapshot === undefined ? undefined : snapshot.versions.find(candidate => candidate.id === detailTask.versionId)
  const displayProject = currentProject ?? (taskVersion === undefined ? undefined : snapshot?.projects.find(candidate => candidate.id === taskVersion.projectId))
  const displayVersion = currentVersion ?? taskVersion
  const displayVersionProject = snapshot?.projects.find(candidate => candidate.id === displayVersion?.projectId)
  const detailPriority = detailTask?.priority ?? 'normal'
  const detailModules = (detailTask?.moduleIds ?? []).map(moduleId => displayProject?.config.modules.find(module => module.id === moduleId)?.path ?? moduleId)
  const detailWorkspace = snapshot === undefined ? undefined : currentWorkspace(snapshot, detailTask)
  const anyPreviewOpen = preview !== undefined || review !== undefined
  const asideMin = anyPreviewOpen ? 300 : 220
  const asideCssMax = viewport.width <= 940 ? (anyPreviewOpen ? 380 : 300)
    : viewport.width <= 1180 ? (anyPreviewOpen ? 460 : 380)
      : anyPreviewOpen ? 960 : 720
  const asideMax = Math.min(asideCssMax, Math.max(asideMin, viewport.width - (narrow ? 180 : 460)))
  const asideWidth = Math.min(Math.max(anyPreviewOpen ? preferences.previewWidth : preferences.asideWidth, asideMin), asideMax)
  const setAsideWidth = (width: number): void => setPreferences(current => ({ ...current, [anyPreviewOpen ? 'previewWidth' : 'asideWidth']: width }))
  const bottomMax = Math.max(120, viewport.height - 220)
  const bottomHeight = Math.min(Math.max(preferences.bottomHeight, 80), bottomMax)
  const previewSessionId: SessionId | undefined = preview?.sessionId === undefined
    ? selected ?? boundRows.find(row => row.task?.id === detailTask?.id)?.sessionId as SessionId | undefined
    : preview.sessionId as SessionId
  const taskSessions = snapshot === undefined || detailTask === undefined ? [] : boundSessions(snapshot).filter(row => row.task.id === detailTask.id)
  const tokenUsage = aggregateTokenUsage(taskSessions.map(row => sessions.projectionsBySession[row.sessionId as SessionId]?.values))
  const temporaryWorkspace = snapshot?.workspaces.filter(candidate => candidate.cleaned !== true).at(-1)
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
  async function openTemporary(): Promise<void> {
    if (temporaryWorkspace === undefined) return
    try {
      const id = await createSessionInWorkspace(temporaryWorkspace.path)
      setDismissed(undefined); setTask(undefined); setSelected(id); setView('workbench')
    } catch { /* the next snapshot keeps native Session state authoritative */ }
  }
  async function moveTask(record: TaskRecord, target: TaskRecord['status']): Promise<void> {
    try {
      const result = await transitionTask({ taskId: record.id, target, actor: 'human' })
      if (result.ok) setAttempt(current => current + 1)
    } catch { /* the next snapshot keeps the authoritative status */ }
  }
  async function removeProject(target: ProjectRecord): Promise<RemoteResult<void>> {
    const result = await deleteProject({ projectId: target.id })
    if (result.ok) {
      setPinnedProjects(current => current.filter(id => id !== target.id))
      if (filterProject === target.id) setFilterProject('')
      setFilterVersion('')
      setProject(undefined); setVersion(undefined); setTask(undefined); setSelected(undefined); setDismissed(undefined)
      setAttempt(current => current + 1)
    }
    return result
  }
  async function removeVersion(target: VersionRecord): Promise<RemoteResult<void>> {
    const result = await deleteVersion({ versionId: target.id })
    if (result.ok) {
      if (filterVersion === target.id) setFilterVersion('')
      setVersion(undefined); setTask(undefined); setSelected(undefined); setDismissed(undefined)
      setAttempt(current => current + 1)
    }
    return result
  }
  async function removeTask(target: TaskRecord): Promise<RemoteResult<void>> {
    const result = await deleteTask({ taskId: target.id })
    if (result.ok) {
      setTask(undefined); setSelected(undefined); setDismissed(undefined)
      setAttempt(current => current + 1)
    }
    return result
  }
  function openCreate(kind: CreateKind): void { setCreate(kind); setEdit(undefined); setMenuOpen(false) }
  function openEdit(kind: EditKind): void { setEdit(kind); setCreate(undefined); setMenuOpen(false) }
  function updatePreferences(next: LoomPreferences): void {
    setPreferences(next)
    setView(next.view)
    setKbMode(next.kanbanMode)
    setAsideOpen(next.contextOpen)
  }
  const selectedSessionTitle = selected === undefined ? undefined : sessions.byId[selected]?.displayTitle
  const headerTitle = detailTask?.title ?? selectedSessionTitle ?? t('conv.titleFallback')
  const filter: ShellFilter = {
    ...(filterProject === '' ? {} : { projectId: filterProject as ProjectRecord['id'] }),
    ...(filterVersion === '' ? {} : { versionId: filterVersion as VersionRecord['id'] }),
    ...(filterPriority === '' ? {} : { priority: filterPriority }),
    ...(filterModule === '' ? {} : { moduleId: filterModule }),
    ...(kbSearch.trim() === '' ? {} : { search: kbSearch }),
  }
  const createVersionFor = (projectRecord: ProjectRecord): VersionRecord | undefined => snapshot?.versions.filter(candidate => candidate.projectId === projectRecord.id).at(-1)
  const createDisabledVersion = currentProject === undefined
  const createDisabledTask = currentVersion === undefined
  return <div style={frame}>
    <style>{`
      .loom-top-context { max-width: 190px; }
      .loom-top-select { max-width: 132px; }
      .loom-top-context:hover { border-color: var(--dsw-alias-border-l3); }
      .loom-top-action:hover { border-color: var(--dsw-alias-border-l3); color: var(--dsw-alias-label-primary); }
      .loom-top-new:hover { filter: brightness(1.08); }
      .loom-view-switch button:hover:not([aria-pressed='true']) { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); }
      .loom-menu-item:hover { background: var(--dsw-alias-bg-layer-3); }
      .loom-top-action:focus-visible, .loom-top-new:focus-visible, .loom-view-switch button:focus-visible, .loom-menu-item:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
      .loom-top-select:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; border-radius: 3px; }
      @media (max-width: 1180px) { .loom-sidebar { width: 196px !important; } .loom-aside { max-width: 380px !important; } .loom-aside.loom-aside-preview { max-width: 460px !important; } .loom-top-label, .loom-top-divider, .loom-top-activity-label, .loom-top-action-label { display: none; } .loom-top-context { max-width: 140px; } .loom-top-select { max-width: 100px; } .loom-top-activity { padding: 0 7px; } .loom-top-new { width: 30px; padding: 0 !important; } .loom-view-switch button { padding: 0 9px; } }
      @media (max-width: 940px) { .loom-sidebar { display: none !important; } .loom-sidebar.loom-sidebar-open { display: block !important; position: absolute; top: 44px; bottom: 0; left: 0; z-index: 70; width: 240px !important; box-shadow: 12px 0 28px rgba(0,0,0,.35); } .loom-aside { max-width: 300px !important; } .loom-aside.loom-aside-preview { max-width: 380px !important; } }
      @media (max-width: 760px) { .loom-aside, .loom-aside-handle { display: none !important; } .loom-brand-name { display: none; } .loom-top-context { max-width: 128px; } .loom-top-select { max-width: 76px; } }
      @media (max-width: 560px) { .loom-topbar { column-gap: 6px !important; } .loom-top-context { flex: 1 1 0; max-width: none; padding: 0 8px; } .loom-top-select { flex: 1; max-width: none; width: 100%; } .loom-view-switch button { padding: 0 8px; } }
    `}</style>
    <header className="loom-topbar" style={topbar}>
      {narrow && <button type="button" aria-label={t('side.projects')} aria-expanded={sidebarOpen} title={t('side.projects')} onClick={() => setSidebarOpen(value => !value)} style={{ ...topAction, width: 28, height: 28 }} className="loom-top-action"><IconFolderOpenRegular size={14} /></button>}
      <span style={topBrand}>
        <span style={{ width: 22, height: 22, borderRadius: 6, background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.purple})`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontSize: 11, color: '#fff' }}>织</span>
        <span className="loom-brand-name">{t('brand')}</span>
      </span>
      <span aria-hidden className="loom-top-divider" style={topDivider} />
      <label className="loom-top-context" style={topContext}>
        <span className="loom-top-label" style={topContextLabel}>{t('top.project')}</span>
        <select className="loom-top-select" aria-label={t('top.project')} value={project ?? ''} onChange={(event) => { const next = event.target.value; setProject(next === '' ? undefined : next as ProjectRecord['id']); setVersion(undefined); setTask(undefined); setSelected(undefined) }} style={topSelect}>
          <option value="">{t('top.allProjects')}</option>
          {(snapshot?.projects ?? []).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.config.name}</option>)}
        </select>
      </label>
      <label className="loom-top-context" style={topContext}>
        <span className="loom-top-label" style={topContextLabel}>{t('top.version')}</span>
        <select className="loom-top-select" aria-label={t('top.version')} value={version ?? ''} onChange={(event) => {
          const next = event.target.value
          if (next === '') { setVersion(undefined); setTask(undefined); setSelected(undefined); return }
          const owner = snapshot?.versions.find(candidate => candidate.id === next)
          if (owner !== undefined) setProject(owner.projectId)
          setVersion(next as VersionRecord['id']); setTask(undefined); setSelected(undefined)
        }} style={topSelect}>
          <option value="">{t('top.allVersions')}</option>
          {(snapshot?.versions ?? []).filter(candidate => project === undefined || candidate.projectId === project).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </select>
      </label>
      <span className="loom-top-activity" style={topActivity} title={`${String(activeCount)} ${t('top.activeWorkspaces')}`}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: COLORS.green, boxShadow: '0 0 0 3px rgba(63,185,80,.14)', flex: 'none' }} />
        <span>{activeCount}</span>
        <span className="loom-top-activity-label">{t('top.activeWorkspaces')}</span>
      </span>
      <div className="loom-view-switch" style={topViewSwitch}>
        <button type="button" aria-pressed={view === 'workbench'} onClick={() => { setView('workbench'); setPreferences(current => ({ ...current, view: 'workbench' })) }} style={{ ...topViewButton, ...view === 'workbench' ? { background: COLORS.panel3, color: COLORS.text, fontWeight: 500, boxShadow: '0 1px 2px rgba(0,0,0,.12)' } : {} }}>{t('workbench')}</button>
        <button type="button" aria-pressed={view === 'kanban'} onClick={() => { setView('kanban'); setPreferences(current => ({ ...current, view: 'kanban' })) }} style={{ ...topViewButton, ...view === 'kanban' ? { background: COLORS.panel3, color: COLORS.text, fontWeight: 500, boxShadow: '0 1px 2px rgba(0,0,0,.12)' } : {} }}>{t('view.kanban')}</button>
      </div>
      <span className="loom-top-spacer" style={topSpacer} />
      <div style={topActions}>
        <div style={{ position: 'relative' }}>
          <button type="button" className="loom-top-new" aria-label={t('top.new')} aria-haspopup="menu" aria-expanded={menuOpen} title={t('top.new')} onClick={() => setMenuOpen(value => !value)} style={topNew}><IconPlusOutlineRegular size={14} /><span className="loom-top-action-label">{t('top.new')}</span></button>
          {menuOpen && <div role="menu" style={topMenu}>
            <button type="button" role="menuitem" className="loom-menu-item" style={menuItem} onClick={() => openCreate('project')}>{t('top.newProject')}</button>
            <button type="button" role="menuitem" className="loom-menu-item" style={menuItem} onClick={() => openCreate('import')}>{t('project.import')}</button>
            <button type="button" role="menuitem" className="loom-menu-item" style={{ ...menuItem, opacity: createDisabledVersion ? 0.45 : 1 }} disabled={createDisabledVersion} onClick={() => openCreate('version')}>{t('top.newVersion')}</button>
            <button type="button" role="menuitem" className="loom-menu-item" style={{ ...menuItem, opacity: createDisabledTask ? 0.45 : 1 }} disabled={createDisabledTask} onClick={() => openCreate('task')}>{t('top.newTask')}</button>
          </div>}
        </div>
        <Tooltip label={t('ctx.project')} side="bottom" delayMs={300}>
          <button type="button" aria-label={t('ctx.project')} aria-pressed={asideOpen} onClick={() => setAsideOpen(value => { const next = !value; setPreferences(current => ({ ...current, contextOpen: next })); return next })} className="loom-top-action" style={{ ...topAction, ...asideOpen ? topActionActive : {} }}><span aria-hidden style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}><IconPanelLeftOutlineRegular size={14} /></span></button>
        </Tooltip>
        <Tooltip label={t('top.settings')} side="bottom" delayMs={300}>
          <button type="button" aria-label={t('top.settings')} onClick={() => setSettingsOpen(true)} className="loom-top-action" style={topAction}><IconSettingsOutlineRegular size={14} /></button>
        </Tooltip>
      </div>
    </header>
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {narrow && sidebarOpen && <div aria-hidden style={{ position: 'absolute', inset: 0, top: 44, background: 'rgba(0,0,0,.35)', zIndex: 65 }} onClick={() => setSidebarOpen(false)} />}
      <aside className={sidebarOpen && narrow ? 'loom-sidebar loom-sidebar-open' : 'loom-sidebar'} style={sidebar}>
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
          {taskSessionList.length === 0 && <p style={{ ...metaLine, padding: '2px 14px 6px' }}>{t('side.empty')}</p>}
          {taskSessionList.map(row => {
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
          <button type="button" title={temporaryWorkspace?.path} style={{ margin: '0 12px 8px', display: 'block', width: 'calc(100% - 24px)', textAlign: 'center', padding: 5, border: `1px dashed ${COLORS.border}`, borderRadius: 6, background: 'transparent', color: COLORS.faint, fontSize: 12, cursor: temporaryWorkspace === undefined ? 'not-allowed' : 'pointer', opacity: temporaryWorkspace === undefined ? 0.5 : 1 }} disabled={temporaryWorkspace === undefined} onClick={() => { void openTemporary() }}>{t('side.newTemporary')}</button>
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
            priorityValue={filterPriority}
            moduleValue={filterModule}
            searchValue={kbSearch}
            onMode={mode => { setKbMode(mode); setPreferences(current => ({ ...current, kanbanMode: mode })) }}
            onProject={(value) => { setFilterProject(value); setFilterVersion(''); setFilterModule('') }}
            onVersion={(value) => { setFilterVersion(value); setFilterModule('') }}
            onPriority={(value) => setFilterPriority(value === '' ? '' : value as TaskPriority)}
            onModule={setFilterModule}
            onSearch={setKbSearch}
            onSelect={selectTask}
            onMove={(record, target) => { void moveTask(record, target) }}
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
              {detailTask !== undefined && <span style={{ ...pill, color: PRIORITY_META[detailPriority].color }}>{t(PRIORITY_META[detailPriority].key)}</span>}
              {detailModules.slice(0, 2).map((module, index) => <span key={`${module}-${String(index)}`} style={pill}>{module}</span>)}
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
                {selected !== undefined && detailTask !== undefined && <button style={select} onClick={() => { setDismissed(detailTask.id); setSelected(undefined) }}>{t('task.details')}</button>}
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
                      {snapshot !== undefined && <ExecutionPanel t={t} task={detailTask} snapshot={snapshot} selectedSession={selected} actions={execution} loadChanges={workspaceChanges} renderFactorySlot={renderFactorySlot} />}
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
      {asideOpen && <LoomResizeHandle label={t('layout.resizeAside')} orientation="vertical" value={asideWidth} min={asideMin} max={asideMax} invert onChange={setAsideWidth} className="loom-aside-handle" />}
      {asideOpen && <aside className={preview === undefined && review === undefined ? 'loom-aside' : 'loom-aside loom-aside-preview'} style={{ ...aside, width: asideWidth }}>
        {review !== undefined
          ? <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: `0.5px solid ${COLORS.border}`, flex: 'none' }}>
                <strong style={{ fontSize: 12.5 }}>{t('diff.preview')}</strong>
                <span style={{ ...metaLine, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('review.title', { turn: String(review.turn) })}</span>
                <button type="button" style={{ ...select, marginLeft: 'auto' }} onClick={() => { workspacePreview.close(); workspaceReviewPreview.close() }}>{t('form.close')}</button>
              </div>
              <LoomReviewPreview t={t} sessionId={review.sessionId} seq={review.seq} initialIndex={review.index} renderFactorySlot={renderFactorySlot} onOpenFile={(path) => { openFilePreview({ sessionId: review.sessionId, path, mode: 'file' }) }} />
            </div>
          : preview !== undefined
            ? <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: `0.5px solid ${COLORS.border}`, flex: 'none' }}>
                <strong style={{ fontSize: 12.5 }}>{t('diff.preview')}</strong>
                <span style={{ ...metaLine, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.path}</span>
                <button type="button" style={{ ...select, marginLeft: 'auto' }} onClick={() => workspacePreview.close()}>{t('form.close')}</button>
              </div>
              <LoomFilePreview t={t} workspaceId={detailWorkspace?.id} sessionId={previewSessionId} filePath={preview.path} initialMode={preview.mode ?? 'diff'} loadChanges={workspaceChanges} readFile={readFile} renderFactorySlot={renderFactorySlot} />
            </div>
            : view === 'kanban'
            ? snapshot !== undefined && <LoomKanbanAside t={t} snapshot={snapshot} filter={filter} onSelectSession={(id) => { const row = boundRows.find(candidate => candidate.sessionId === id); selectSession(id as SessionId, row?.task) }} />
            : <LoomContextPanel t={t} snapshot={snapshot ?? { projects: [], versions: [], locks: [], tasks: [], workspaces: [], audit: [], executions: [] }} project={displayProject} version={displayVersion} task={detailTask} usage={tokenUsage} generateLock={generateLock} onLockChanged={() => setAttempt(current => current + 1)} onEditProject={() => openEdit('project')} onEditVersion={() => openEdit('version')} onEditTask={() => openEdit('task')} onDeleteProject={displayProject === undefined ? undefined : () => removeProject(displayProject)} onDeleteVersion={displayVersion === undefined ? undefined : () => removeVersion(displayVersion)} onDeleteTask={detailTask === undefined ? undefined : () => removeTask(detailTask)} />}
      </aside>}
    </div>
    {!bottomCollapsed && <LoomResizeHandle label={t('layout.resizeBottom')} orientation="horizontal" value={bottomHeight} min={80} max={bottomMax} invert onChange={(height) => setPreferences(current => ({ ...current, bottomHeight: height }))} />}
    <LoomBottomPanel
      t={t}
      height={bottomHeight}
      collapsed={bottomCollapsed}
      pane={pane}
      audit={auditRows}
      diffCount={diffCount}
      usage={tokenUsage}
      workspaceId={detailWorkspace?.id}
      loadChanges={workspaceChanges}
      renderFactorySlot={renderFactorySlot}
      onOpenFile={(path) => { openFilePreview({ path }); setAsideOpen(true) }}
      onToggle={() => setBottomCollapsed(value => !value)}
      onPane={setPane}
    />
    <LoomSettings
      t={t}
      open={settingsOpen}
      preferences={preferences}
      pinned={(snapshot?.projects ?? []).filter(candidate => pinnedProjects.includes(candidate.id))}
      onChange={updatePreferences}
      onUnpin={id => setPinnedProjects(current => current.filter(candidate => candidate !== id))}
      onClose={() => setSettingsOpen(false)}
    />
    {create !== undefined && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', justifyContent: 'flex-end', zIndex: 60 }} onClick={() => setCreate(undefined)}>
      <div role="dialog" aria-modal="true" aria-label={create === 'project' ? t('top.newProject') : create === 'import' ? t('project.import') : create === 'version' ? t('top.newVersion') : t('top.newTask')} style={drawer} onClick={event => event.stopPropagation()}>
        <div style={drawerHeader}>
          <strong style={drawerTitle}>{create === 'project' ? t('top.newProject') : create === 'import' ? t('project.import') : create === 'version' ? t('top.newVersion') : t('top.newTask')}</strong>
          <Button size="sm" variant="outline" icon={<IconCloseOutlineRegular />} aria-label={t('form.close')} title={t('form.close')} onClick={() => setCreate(undefined)} style={{ marginLeft: 'auto' }} />
        </div>
        {create === 'project' && <ProjectForm t={t} open onOpenChange={value => { if (!value) setCreate(undefined) }} create={createProject} onCreated={created => { setProject(created.id); setVersion(undefined); setTask(undefined); setSelected(undefined); setCreate(undefined); setAttempt(current => current + 1) }} />}
        {create === 'import' && <ImportProjectForm t={t} open onOpenChange={value => { if (!value) setCreate(undefined) }} create={createProject} onCreated={created => { setProject(created.id); setVersion(undefined); setTask(undefined); setSelected(undefined); setCreate(undefined); setAttempt(current => current + 1) }} />}
        {create === 'version' && currentProject !== undefined && <VersionForm t={t} open onOpenChange={value => { if (!value) setCreate(undefined) }} project={currentProject} create={createVersion} onCreated={created => { setVersion(created.id); setTask(undefined); setSelected(undefined); setCreate(undefined); setAttempt(current => current + 1) }} />}
        {create === 'task' && currentVersion !== undefined && currentVersionProject !== undefined && <TaskForm t={t} open onOpenChange={value => { if (!value) setCreate(undefined) }} version={currentVersion} project={currentVersionProject} create={createTask} onCreated={created => { setTask(created); setView('workbench'); setCreate(undefined); setAttempt(current => current + 1) }} />}
        {create === 'version' && currentProject === undefined && <p style={note}>{t('project.select')}</p>}
        {create === 'task' && currentVersion === undefined && <p style={note}>{t('version.select')}</p>}
      </div>
    </div>}
    {edit !== undefined && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', justifyContent: 'flex-end', zIndex: 60 }} onClick={() => setEdit(undefined)}>
      <div role="dialog" aria-modal="true" aria-label={edit === 'project' ? t('project.edit') : edit === 'version' ? t('version.edit') : t('task.edit')} style={drawer} onClick={event => event.stopPropagation()}>
        <div style={drawerHeader}>
          <strong style={drawerTitle}>{edit === 'project' ? t('project.edit') : edit === 'version' ? t('version.edit') : t('task.edit')}</strong>
          <Button size="sm" variant="outline" icon={<IconCloseOutlineRegular />} aria-label={t('form.close')} title={t('form.close')} onClick={() => setEdit(undefined)} style={{ marginLeft: 'auto' }} />
        </div>
        {edit === 'project' && displayProject !== undefined && <ProjectForm t={t} open project={displayProject} create={createProject} update={updateProject} onOpenChange={value => { if (!value) setEdit(undefined) }} onCreated={updated => { setProject(updated.id); setEdit(undefined); setAttempt(current => current + 1) }} />}
        {edit === 'version' && displayVersion !== undefined && displayVersionProject !== undefined && <VersionForm t={t} open version={displayVersion} project={displayVersionProject} create={createVersion} update={updateVersion} onOpenChange={value => { if (!value) setEdit(undefined) }} onCreated={updated => { setVersion(updated.id); setEdit(undefined); setAttempt(current => current + 1) }} />}
        {edit === 'task' && detailTask !== undefined && displayVersion !== undefined && displayVersionProject !== undefined && <TaskForm t={t} open task={detailTask} version={displayVersion} project={displayVersionProject} create={createTask} update={updateTask} onOpenChange={value => { if (!value) setEdit(undefined) }} onCreated={updated => { setTask(updated); setView('workbench'); setEdit(undefined); setAttempt(current => current + 1) }} />}
      </div>
    </div>}
  </div>
}
