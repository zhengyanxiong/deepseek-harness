/** Kanban view with metrics, project swimlanes and the overview panel. */
import { useRef, type CSSProperties } from 'react'
import { IconFolderCloseRegular, IconSearchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CatalogSnapshot, ProjectRecord, TaskRecord } from 'dsh-workloom/types'
import type { BoardColumn } from './board.ts'
import { boardMetrics, boundSessions, flatBoard, projectLanes, type ShellFilter } from './projection.ts'
import { AUDIT_LABEL, canMoveTask, COLORS, metaLine, sectionTitle, select, shortCommit, PRIORITY_META, STATUS_META, STATUS_ORDER } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** Kanban toolbar and lane inputs. */
export interface LoomKanbanProps {
  readonly t: Translate
  readonly snapshot: CatalogSnapshot
  /** Tasks whose bound native Session is currently running; only these pulse. */
  readonly liveTaskIds?: ReadonlySet<string> | undefined
  readonly filter: ShellFilter
  readonly mode: 'flat' | 'grouped'
  readonly projectValue: string
  readonly versionValue: string
  readonly priorityValue: string
  readonly moduleValue: string
  readonly searchValue: string
  readonly onMode: (mode: 'flat' | 'grouped') => void
  readonly onProject: (value: string) => void
  readonly onVersion: (value: string) => void
  readonly onPriority: (value: string) => void
  readonly onModule: (value: string) => void
  readonly onSearch: (value: string) => void
  readonly onSelect: (task: TaskRecord) => void
  readonly onMove: (task: TaskRecord, target: TaskRecord['status']) => void
  readonly onNewCard: (project: ProjectRecord) => void
}

const toolbar: CSSProperties = { flex: 'none', padding: '9px 14px 0', background: COLORS.panel, borderBottom: `0.5px solid ${COLORS.border}` }
const metricsRow: CSSProperties = { display: 'flex', alignItems: 'center', height: 24, minWidth: 0, overflow: 'hidden' }
const metricStyle: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 5, height: 16, padding: '0 10px', borderRight: `0.5px solid ${COLORS.border}`, color: COLORS.faint, fontSize: 10, whiteSpace: 'nowrap' }
const filterBar: CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5, padding: '7px 0 10px', minWidth: 0 }
const filterChip: CSSProperties = { ...select, height: 25, fontSize: 10.5, padding: '0 7px', background: COLORS.panel, flex: 'none', maxWidth: 132 }
const searchBox: CSSProperties = { flex: 1, minWidth: 90, height: 25, display: 'flex', alignItems: 'center', gap: 5, padding: '0 8px', border: `0.5px solid ${COLORS.border}`, borderRadius: 6, background: COLORS.panel, color: COLORS.faint }
const modeTrack: CSSProperties = { flex: 'none', display: 'flex', gap: 1, padding: 2, borderRadius: 6, background: COLORS.panel3, marginLeft: 'auto' }
const modeButton: CSSProperties = { height: 21, padding: '0 7px', border: 'none', borderRadius: 4, background: 'transparent', color: COLORS.faint, font: 'inherit', fontSize: 9.5, cursor: 'pointer' }
const boardArea: CSSProperties = { flex: 1, minHeight: 0, overflow: 'auto', padding: '9px 12px 12px', background: COLORS.panel2, display: 'flex', flexDirection: 'column', gap: 9 }
const laneStyle: CSSProperties = { display: 'flex', flexDirection: 'column', minHeight: 210, gap: 4 }
const laneHead: CSSProperties = { height: 23, display: 'flex', alignItems: 'center', gap: 5, padding: '0 2px', flex: 'none' }
const laneName: CSSProperties = { fontSize: 11, fontWeight: 500, color: COLORS.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const columnsGrid: CSSProperties = { flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))', gap: 6, marginTop: 2 }
const card: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left', width: '100%', background: COLORS.panel, border: `0.5px solid ${COLORS.border}`, borderLeftWidth: 2, borderRadius: 6, padding: '6px 7px', cursor: 'pointer', color: 'inherit', font: 'inherit', flex: 'none', overflow: 'hidden' }
const cardTitle: CSSProperties = { fontWeight: 500, fontSize: 11.5, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }
const cardDescription: CSSProperties = { fontSize: 10, lineHeight: 1.4, color: COLORS.faint, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }
const chipBase: CSSProperties = { padding: '1px 4px', borderRadius: 3, font: '9px/1.35 ui-monospace, monospace', whiteSpace: 'nowrap' }

function Metric({ value, label, color, first }: { value: number; label: string; color?: string; first?: boolean }) {
  return <div style={{ ...metricStyle, ...(first === true ? { paddingLeft: 0 } : {}) }}><b style={{ fontWeight: 400, fontSize: 13, color: color ?? COLORS.text, fontFamily: 'ui-monospace, monospace' }}>{String(value)}</b><span>{label}</span></div>
}

function Card({ task, versionName, sessions, live, versionProjects, moduleNamesByProject, t, onSelect }: { task: TaskRecord; versionName: string; sessions: number; live: boolean; versionProjects: ReadonlyMap<string, string>; moduleNamesByProject: ReadonlyMap<string, ReadonlyMap<string, string>>; t: Translate; onSelect: (task: TaskRecord) => void }) {
  const meta = STATUS_META[task.status]
  const priority = task.priority ?? 'normal'
  const priorityMeta = PRIORITY_META[priority]
  const commit = shortCommit(task.attempts.at(-1)?.lock)
  const modules = (task.moduleIds ?? []).map(moduleId => moduleNamesByProject.get(versionProjects.get(task.versionId) ?? '')?.get(moduleId) ?? moduleId)
  const lastDragAt = useRef(0)
  const executing = live
  return <button type="button" className={executing ? 'loom-kb-card-running' : undefined} draggable onDragStart={event => { lastDragAt.current = Date.now(); event.dataTransfer?.setData('text/plain', task.id); if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => { lastDragAt.current = Date.now() }} style={{ ...card, borderLeftColor: meta.color }} onClick={() => { if (Date.now() - lastDragAt.current > 500) onSelect(task) }}>
    <span style={cardTitle}>{task.title}</span>
    {task.description !== undefined && task.description !== '' && <span style={cardDescription}>{task.description}</span>}
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {versionName !== '' && <span style={{ ...chipBase, background: 'color-mix(in srgb, var(--loom-accent) 10%, transparent)', color: COLORS.accent }}>{versionName}</span>}
      <span style={{ ...chipBase, background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent)', color: priorityMeta.color }}>{t(priorityMeta.key)}</span>
      {task.attempts.length > 1 && <span style={{ ...chipBase, color: COLORS.faint }}>↻ {String(task.attempts.length)}</span>}
    </span>
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingTop: 4, borderTop: `0.5px solid ${COLORS.border}`, color: COLORS.faint, fontSize: 9, minWidth: 0, lineHeight: 1.2 }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {modules.length === 0 ? '—' : modules.slice(0, 2).join(' · ')}{modules.length > 2 ? ` +${String(modules.length - 2)}` : ''}
      </span>
      <span style={{ flex: 'none', display: 'flex', gap: 5, alignItems: 'center' }}>
        {commit !== undefined && <span style={{ fontFamily: 'ui-monospace, monospace' }}>🔒 {commit}</span>}
        <span>{sessions > 0 ? `${String(sessions)} ${t('kb.sessions')}` : '—'}</span>
      </span>
    </span>
  </button>
}

function Column({ column, t, versionNames, versionProjects, moduleNamesByProject, sessionCounts, liveTaskIds, onSelect, onDropTask }: {
  column: BoardColumn
  t: Translate
  versionNames: ReadonlyMap<string, string>
  versionProjects: ReadonlyMap<string, string>
  moduleNamesByProject: ReadonlyMap<string, ReadonlyMap<string, string>>
  sessionCounts: ReadonlyMap<string, number>
  liveTaskIds: ReadonlySet<string>
  onSelect: (task: TaskRecord) => void
  onDropTask: (taskId: TaskRecord['id'], target: TaskRecord['status']) => void
}) {
  const meta = STATUS_META[column.status]
  return <div
    role="group"
    aria-label={t(meta.key)}
    onDragOver={event => { event.preventDefault(); if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move' }}
    onDrop={event => { event.preventDefault(); const id = event.dataTransfer?.getData('text/plain'); if (id !== undefined && id !== '') onDropTask(id as TaskRecord['id'], column.status) }}
    style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: COLORS.panel2, border: `0.5px solid ${COLORS.border}`, borderRadius: 7, overflow: 'hidden' }}>
    <div style={{ flex: 'none', height: 27, display: 'flex', alignItems: 'center', gap: 5, padding: '0 7px', borderBottom: `0.5px solid ${COLORS.border}`, background: COLORS.panel3, fontSize: 10 }}>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: meta.color, flex: 'none' }} />
      <span style={{ color: COLORS.dim, whiteSpace: 'nowrap' }}>{t(meta.key)}</span>
      <span style={{ marginLeft: 'auto', padding: '1px 4px', border: `0.5px solid ${COLORS.border}`, borderRadius: 5, background: COLORS.panel, color: COLORS.faint, font: '9px/1.15 ui-monospace, monospace' }}>{String(column.tasks.length)}</span>
      {column.status === 'running' && <span style={{ fontSize: 8.5, color: COLORS.warn, background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent)', borderRadius: 3, padding: '1px 4px' }}>{t('kb.wip')}</span>}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: 6, flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {column.tasks.length === 0 && <span style={{ ...metaLine, textAlign: 'center', padding: '12px 5px', border: `0.5px dashed ${COLORS.border}`, borderRadius: 5, fontSize: 9.5 }}>{t('kb.empty')}</span>}
      {column.tasks.map(task => <Card key={task.id} task={task} versionName={versionNames.get(task.versionId) ?? ''} sessions={sessionCounts.get(task.id) ?? 0} live={liveTaskIds.has(task.id)} versionProjects={versionProjects} moduleNamesByProject={moduleNamesByProject} t={t} onSelect={onSelect} />)}
    </div>
  </div>
}

/**
 * Render the kanban toolbar, project swimlanes and flat board.
 * @param props - Catalog snapshot, filters and board callbacks.
 * @returns the board view.
 */
export function LoomKanban(props: LoomKanbanProps) {
  const { t, snapshot, liveTaskIds = new Set(), filter, mode, projectValue, versionValue, priorityValue, moduleValue, searchValue, onMode, onProject, onVersion, onPriority, onModule, onSearch, onSelect, onMove, onNewCard } = props
  const metrics = boardMetrics(snapshot, filter)
  const versionNames = new Map(snapshot.versions.map(version => [version.id, version.name]))
  const versionProjects = new Map(snapshot.versions.map(version => [version.id, version.projectId]))
  const moduleNamesByProject = new Map(snapshot.projects.map(project => [project.id, new Map(project.config.modules.map(module => [module.id, module.path]))]))
  const sessionCounts = new Map<string, number>()
  const handleDrop = (taskId: TaskRecord['id'], target: TaskRecord['status']): void => {
    const record = snapshot.tasks.find(candidate => candidate.id === taskId)
    if (record !== undefined && canMoveTask(record.status, target)) onMove(record, target)
  }
  for (const row of boundSessions(snapshot)) sessionCounts.set(row.task.id, (sessionCounts.get(row.task.id) ?? 0) + 1)
  const versions = snapshot.versions.filter(version => projectValue === '' || version.projectId === projectValue)
  const lanes = projectLanes(snapshot, filter)
  const flat = flatBoard(snapshot, filter)
  const moduleProjectId = projectValue === '' ? '' : projectValue
  return <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: COLORS.panel }}>
    <div style={toolbar}>
      <div style={metricsRow}>
        <Metric first value={metrics.cards} label={t('kb.cards')} />
        <Metric value={metrics.running} label={t('kb.running')} color={COLORS.accent} />
        <Metric value={metrics.activeSessions} label={t('kb.activeSessions')} />
        <Metric value={metrics.review} label={t('kb.review')} color={COLORS.purple} />
        <Metric value={metrics.completed} label={t('kb.completed')} color={COLORS.green} />
      </div>
      <div style={filterBar}>
        <select aria-label={t('top.project')} value={projectValue} onChange={event => { onProject(event.target.value) }} style={filterChip}>
          <option value="">{t('top.allProjects')}</option>
          {snapshot.projects.map(project => <option key={project.id} value={project.id}>{project.config.name}</option>)}
        </select>
        <select aria-label={t('top.version')} value={versionValue} onChange={event => { onVersion(event.target.value) }} style={filterChip}>
          <option value="">{t('top.allVersions')}</option>
          {versions.map(version => <option key={version.id} value={version.id}>{version.name}</option>)}
        </select>
        <select aria-label={t('kb.priority')} value={priorityValue} onChange={event => onPriority(event.target.value)} style={filterChip}>
          <option value="">{t('kb.priority')}</option>
          <option value="low">{t('task.priority.low')}</option>
          <option value="normal">{t('task.priority.normal')}</option>
          <option value="high">{t('task.priority.high')}</option>
        </select>
        <select aria-label={t('kb.module')} value={moduleValue} onChange={event => onModule(event.target.value)} disabled={moduleProjectId === ''} style={{ ...filterChip, opacity: moduleProjectId === '' ? 0.55 : 1 }}>
          <option value="">{t('kb.module')}</option>
          {snapshot.projects.filter(project => project.id === moduleProjectId).flatMap(project => project.config.modules).map(module => <option key={module.id} value={module.id}>{module.path}</option>)}
        </select>
        <label style={searchBox}>
          <IconSearchOutlineRegular size={11} />
          <input aria-label={t('kb.search')} placeholder={t('kb.search')} value={searchValue} onChange={event => onSearch(event.target.value)} style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: COLORS.text, font: 'inherit', fontSize: 10.5 }} />
        </label>
        <div style={modeTrack}>
          <button type="button" aria-pressed={mode === 'grouped'} onClick={() => onMode('grouped')} style={{ ...modeButton, ...(mode === 'grouped' ? { background: COLORS.panel, color: COLORS.text, boxShadow: '0 1px 2px rgba(15,17,21,.10)' } : {}) }}>{t('kb.grouped')}</button>
          <button type="button" aria-pressed={mode === 'flat'} onClick={() => onMode('flat')} style={{ ...modeButton, ...(mode === 'flat' ? { background: COLORS.panel, color: COLORS.text, boxShadow: '0 1px 2px rgba(15,17,21,.10)' } : {}) }}>{t('kb.flat')}</button>
        </div>
      </div>
    </div>
    <div style={boardArea}>
      {mode === 'grouped'
        ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
            {lanes.map(({ project, versions: projectVersions, columns, count }, index) => <div key={project.id} style={{ ...laneStyle, flex: `${index === 0 ? '1.25' : '0.82'} 1 0` }}>
              <div style={laneHead}>
                <span style={{ display: 'flex', color: COLORS.faint }}><IconFolderCloseRegular size={11} /></span>
                <span style={laneName}>{project.config.name}</span>
                <span style={{ ...metaLine, fontSize: 9, fontFamily: 'ui-monospace, monospace' }}>{String(count)}</span>
                <span style={{ ...metaLine, fontSize: 9 }}>{String(projectVersions.length)} {t('kb.laneSub')}</span>
                <button type="button" style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: COLORS.faint, font: 'inherit', fontSize: 9.5, cursor: 'pointer', padding: '2px 0' }} onClick={() => onNewCard(project)}>＋ {t('kb.newCard')}</button>
              </div>
              <div className="loom-kb-columns" style={columnsGrid}>
                {columns.map(column => <Column key={column.status} column={column} t={t} versionNames={versionNames} versionProjects={versionProjects} moduleNamesByProject={moduleNamesByProject} sessionCounts={sessionCounts} liveTaskIds={liveTaskIds} onSelect={onSelect} onDropTask={handleDrop} />)}
              </div>
            </div>)}
            {lanes.length === 0 && <p style={metaLine}>{t('kb.empty')}</p>}
          </div>
        : <div className="loom-kb-columns" style={{ ...columnsGrid, flex: 1, minHeight: 210, marginTop: 0 }}>
            {flat.map(column => <Column key={column.status} column={column} t={t} versionNames={versionNames} versionProjects={versionProjects} moduleNamesByProject={moduleNamesByProject} sessionCounts={sessionCounts} liveTaskIds={liveTaskIds} onSelect={onSelect} onDropTask={handleDrop} />)}
          </div>}
    </div>
  </div>
}

/** Right-side overview for the kanban view; every statistic comes from the catalog. */
export function LoomKanbanAside({ t, snapshot, filter, onSelectSession }: { t: Translate; snapshot: CatalogSnapshot; filter: ShellFilter; onSelectSession: (sessionId: string) => void }) {
  const metrics = boardMetrics(snapshot, filter)
  const versions = new Map(snapshot.versions.map(version => [version.id, version]))
  const sessions = boundSessions(snapshot).filter(row => row.task.status === 'running')
  const reviews = snapshot.tasks.filter(task => task.status === 'review')
  const projectTasks = new Map<string, number>()
  for (const project of snapshot.projects) {
    const versionIds = new Set(snapshot.versions.filter(version => version.projectId === project.id).map(version => version.id))
    projectTasks.set(project.id, snapshot.tasks.filter(task => versionIds.has(task.versionId)).length)
  }
  const recent = [...snapshot.audit].reverse().slice(0, 4)
  const stat = (value: number, label: string, color?: string) => <div style={{ background: COLORS.panel, border: `0.5px solid ${COLORS.border}`, borderRadius: 7, padding: '8px 9px' }}><div style={{ fontWeight: 400, fontFamily: 'ui-monospace, monospace', fontSize: 16, lineHeight: 1, color: color ?? COLORS.text }}>{String(value)}</div><div style={{ ...metaLine, marginTop: 4, fontSize: 9.5 }}>{label}</div></div>
  return <div style={{ overflow: 'auto', flex: 1 }}>
    <div style={{ padding: '12px 14px 9px', borderBottom: `0.5px solid ${COLORS.border}` }}>
      <div style={{ ...metaLine, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase' }}>{t('kb.panel')}</div>
      <div style={{ marginTop: 4, fontSize: 14, fontWeight: 500, color: COLORS.text }}>{t('board')}</div>
    </div>
    <section style={{ padding: '10px 14px', borderBottom: `0.5px solid ${COLORS.border}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {stat(metrics.cards, t('kb.cards'))}
        {stat(metrics.running, t('kb.running'), COLORS.accent)}
        {stat(metrics.activeSessions, t('kb.activeSessions'), COLORS.green)}
        {stat(metrics.review, t('kb.review'), COLORS.purple)}
      </div>
    </section>
    <section style={{ borderBottom: `0.5px solid ${COLORS.border}`, padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('kb.panelActive')}</h4>
      {sessions.length === 0 && <p style={metaLine}>{t('kb.panelNone')}</p>}
      {sessions.map(row => <button key={row.sessionId} type="button" onClick={() => onSelectSession(row.sessionId)} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 6, padding: '5px 4px', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
        <span style={{ width: 6, height: 6, marginTop: 4, borderRadius: 999, background: COLORS.accent, flex: 'none' }} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, overflowWrap: 'anywhere' }}>{row.task.title}</span>
          <span style={{ ...metaLine, display: 'block', marginTop: 2 }}>{versions.get(row.versionId)?.name ?? ''}</span>
        </span>
      </button>)}
    </section>
    <section style={{ borderBottom: `0.5px solid ${COLORS.border}`, padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('kb.panelReview')}</h4>
      {reviews.length === 0 && <p style={metaLine}>{t('kb.panelNone')}</p>}
      {reviews.map(task => <p key={task.id} style={{ margin: '5px 0 0', fontSize: 10.5, lineHeight: 1.45, color: COLORS.dim, overflowWrap: 'anywhere' }}>{task.title}</p>)}
    </section>
    <section style={{ borderBottom: `0.5px solid ${COLORS.border}`, padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('kb.projects')}</h4>
      {snapshot.projects.length === 0 && <p style={metaLine}>{t('kb.panelNone')}</p>}
      {snapshot.projects.map(project => <div key={project.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderTop: `0.5px solid ${COLORS.border}`, fontSize: 10, color: COLORS.dim }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.config.name}</span>
        <b style={{ color: COLORS.faint, font: '9px/1 ui-monospace, monospace', fontWeight: 400 }}>{String(projectTasks.get(project.id) ?? 0)}</b>
      </div>)}
    </section>
    <section style={{ padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('kb.recent')}</h4>
      {recent.length === 0 && <p style={metaLine}>{t('kb.panelNone')}</p>}
      {recent.map(entry => <div key={entry.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '5px 0', borderTop: `0.5px solid ${COLORS.border}`, fontSize: 9.5, lineHeight: 1.4 }}>
        <span style={{ flex: 'none', color: COLORS.faint, fontFamily: 'ui-monospace, monospace', fontSize: 8.5 }}>{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
        <span style={{ minWidth: 0, color: COLORS.dim, overflowWrap: 'anywhere' }}>{t(AUDIT_LABEL[entry.event])}{entry.detail === undefined ? '' : ` · ${entry.detail}`}</span>
      </div>)}
    </section>
  </div>
}

/** Status labels used by the tree and context panel. */
export function statusLabel(status: TaskRecord['status'], t: Translate): string {
  return t(STATUS_META[status].key)
}

/** Ordered statuses shared with the board. */
export { STATUS_ORDER }
