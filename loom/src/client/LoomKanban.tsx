/** Kanban view with metrics, project swimlanes and the overview panel. */
import type { CSSProperties } from 'react'
import { IconFolderCloseRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CatalogSnapshot, ProjectRecord, TaskRecord } from 'dsh-loom/types'
import type { BoardColumn } from './board.ts'
import { boardMetrics, boundSessions, flatBoard, projectLanes, type ShellFilter } from './projection.ts'
import { cardCount, COLORS, metaLine, pill, sectionTitle, select, shortCommit, PRIORITY_META, STATUS_META, STATUS_ORDER } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** Kanban toolbar and lane inputs. */
export interface LoomKanbanProps {
  readonly t: Translate
  readonly snapshot: CatalogSnapshot
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
  readonly onNewCard: (project: ProjectRecord) => void
}

const metricsChip: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 5, background: COLORS.panel2, border: `0.5px solid ${COLORS.border}`, borderRadius: 7, padding: '3px 9px' }
const filterChip: CSSProperties = { ...select, fontSize: 11, padding: '3px 8px' }
const card: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, textAlign: 'left', width: '100%', background: COLORS.panel2, border: `0.5px solid ${COLORS.border}`, borderRadius: 7, padding: '7px 9px', cursor: 'pointer', color: 'inherit', font: 'inherit' }

function Metric({ value, label, color }: { value: number; label: string; color?: string }) {
  return <div style={metricsChip}><span style={{ fontWeight: 700, fontSize: 14, color: color ?? COLORS.text }}>{String(value)}</span><span style={metaLine}>{label}</span></div>
}

function Card({ task, versionName, sessions, versionProjects, moduleNamesByProject, t, onSelect }: { task: TaskRecord; versionName: string; sessions: number; versionProjects: ReadonlyMap<string, string>; moduleNamesByProject: ReadonlyMap<string, ReadonlyMap<string, string>>; t: Translate; onSelect: (task: TaskRecord) => void }) {
  const meta = STATUS_META[task.status]
  const priority = task.priority ?? 'normal'
  const priorityMeta = PRIORITY_META[priority]
  const commit = shortCommit(task.attempts.at(-1)?.lock)
  const modules = (task.moduleIds ?? []).map(moduleId => moduleNamesByProject.get(versionProjects.get(task.versionId) ?? '')?.get(moduleId) ?? moduleId)
  return <button type="button" style={{ ...card, borderLeft: `2px solid ${meta.color}` }} onClick={() => onSelect(task)}>
    <span style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{task.title}</span>
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 10.5, color: COLORS.faint }}>
      <span style={{ color: COLORS.cyan }}>{versionName}</span>
      <span style={{ color: priorityMeta.color, border: `0.5px solid ${priorityMeta.color}`, borderRadius: 999, padding: '0 5px' }}>{t(priorityMeta.key)}</span>
      {modules.length > 0 && <span style={{ overflowWrap: 'anywhere' }}>{modules.slice(0, 2).join(' · ')}{modules.length > 2 ? ` +${String(modules.length - 2)}` : ''}</span>}
      {commit !== undefined && <span style={{ fontFamily: 'ui-monospace, monospace' }}>🔒 {commit}</span>}
      {task.attempts.length > 1 && <span>↻ {String(task.attempts.length)}</span>}
      {sessions > 0 && <span style={{ color: COLORS.green }}>💬 {String(sessions)}</span>}
      <span style={{ marginLeft: 'auto', color: meta.color }}>●</span>
    </span>
  </button>
}

function Column({ column, t, versionNames, versionProjects, moduleNamesByProject, sessionCounts, onSelect }: {
  column: BoardColumn
  t: Translate
  versionNames: ReadonlyMap<string, string>
  versionProjects: ReadonlyMap<string, string>
  moduleNamesByProject: ReadonlyMap<string, ReadonlyMap<string, string>>
  sessionCounts: ReadonlyMap<string, number>
  onSelect: (task: TaskRecord) => void
}) {
  const meta = STATUS_META[column.status]
  return <div style={{ flex: 1, minWidth: 132, display: 'flex', flexDirection: 'column', background: COLORS.panel, border: `0.5px solid ${COLORS.border}`, borderRadius: 9, overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderBottom: `0.5px solid ${COLORS.border}`, fontWeight: 700, fontSize: 12 }}>
      <span style={{ width: 8, height: 8, borderRadius: 3, background: meta.color }} />
      {t(meta.key)}
      <span style={{ marginLeft: 'auto', color: COLORS.faint, fontWeight: 400, fontSize: 11 }}>{String(column.tasks.length)}</span>
      {column.status === 'running' && <span style={{ fontSize: 10, color: COLORS.warn, background: COLORS.panel3, borderRadius: 4, padding: '0 5px' }}>{t('kb.wip')}</span>}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8, flex: 1 }}>
      {column.tasks.length === 0 && <span style={{ ...metaLine, textAlign: 'center', padding: 6 }}>{t('kb.empty')}</span>}
      {column.tasks.map(task => <Card key={task.id} task={task} versionName={versionNames.get(task.versionId) ?? ''} sessions={sessionCounts.get(task.id) ?? 0} versionProjects={versionProjects} moduleNamesByProject={moduleNamesByProject} t={t} onSelect={onSelect} />)}
    </div>
  </div>
}

/**
 * Render the kanban toolbar, project swimlanes and flat board.
 * @param props - catalog snapshot, filters, display mode and selection handlers.
 * @returns board content without mock cards.
 */
export function LoomKanban(props: LoomKanbanProps) {
  const { t, snapshot, filter, mode, projectValue, versionValue, priorityValue, moduleValue, searchValue, onMode, onProject, onVersion, onPriority, onModule, onSearch, onSelect, onNewCard } = props
  const metrics = boardMetrics(snapshot, filter)
  const versionNames = new Map(snapshot.versions.map(version => [version.id, version.name]))
  const versionProjects = new Map(snapshot.versions.map(version => [version.id, version.projectId]))
  const moduleNamesByProject = new Map<string, ReadonlyMap<string, string>>()
  for (const project of snapshot.projects) moduleNamesByProject.set(project.id, new Map(project.config.modules.map(module => [module.id, module.path])))
  const moduleProjectId = projectValue !== '' ? projectValue : snapshot.versions.find(version => version.id === versionValue)?.projectId ?? ''
  const modules = snapshot.projects
    .filter(project => project.id === moduleProjectId)
    .flatMap(project => project.config.modules.map(module => ({ id: module.id, label: module.path })))
  const sessionCounts = new Map<string, number>()
  for (const row of boundSessions(snapshot)) sessionCounts.set(row.task.id, (sessionCounts.get(row.task.id) ?? 0) + 1)
  const versions = snapshot.versions.filter(version => projectValue === '' || version.projectId === projectValue)
  const lanes = projectLanes(snapshot, filter)
  const flat = flatBoard(snapshot, filter)
  const controls: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '8px 14px', borderBottom: `0.5px solid ${COLORS.border}`, flex: 'none' }
  return <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: COLORS.bg }}>
    <div style={controls}>
      <Metric value={metrics.cards} label={t('kb.cards')} />
      <Metric value={metrics.running} label={t('kb.running')} color={COLORS.accent} />
      <Metric value={metrics.activeSessions} label={t('kb.activeSessions')} />
      <Metric value={metrics.review} label={t('kb.review')} color={COLORS.purple} />
      <Metric value={metrics.completed} label={t('kb.completed')} color={COLORS.green} />
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
      <select aria-label={t('kb.module')} value={moduleValue} onChange={event => onModule(event.target.value)} disabled={moduleProjectId === ''} style={filterChip}>
        <option value="">{t('kb.module')}</option>
        {modules.map(module => <option key={module.id} value={module.id}>{module.label}</option>)}
      </select>
      <input aria-label={t('kb.search')} placeholder={t('kb.search')} value={searchValue} onChange={event => onSearch(event.target.value)} style={{ ...filterChip, cursor: 'text', width: 140 }} />
      <div style={{ marginLeft: 'auto', display: 'flex', border: `0.5px solid ${COLORS.border}`, borderRadius: 7, overflow: 'hidden' }}>
        <button type="button" aria-pressed={mode === 'flat'} onClick={() => onMode('flat')} style={{ ...filterChip, border: 'none', borderRadius: 0, color: mode === 'flat' ? COLORS.text : COLORS.dim, background: mode === 'flat' ? COLORS.panel3 : 'transparent' }}>{t('kb.flat')}</button>
        <button type="button" aria-pressed={mode === 'grouped'} onClick={() => onMode('grouped')} style={{ ...filterChip, border: 'none', borderRadius: 0, color: mode === 'grouped' ? COLORS.text : COLORS.dim, background: mode === 'grouped' ? COLORS.panel3 : 'transparent' }}>{t('kb.grouped')}</button>
      </div>
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
      {mode === 'grouped'
        ? <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {lanes.map(({ project, versions: projectVersions, columns, count }) => <div key={project.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingBottom: 7 }}>
                <span style={{ display: 'flex' }}><IconFolderCloseRegular size={14} /></span><span style={{ fontWeight: 700, fontSize: 13 }}>{project.config.name}</span>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: COLORS.green }} />
                <span style={metaLine}>{projectVersions.length} {t('kb.laneSub')} · {cardCount(count, t)}</span>
                <button type="button" style={{ ...pill, marginLeft: 'auto', cursor: 'pointer', background: 'transparent' }} onClick={() => onNewCard(project)}>＋ {t('kb.newCard')}</button>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', overflowX: 'auto' }}>
                {columns.map(column => <Column key={column.status} column={column} t={t} versionNames={versionNames} versionProjects={versionProjects} moduleNamesByProject={moduleNamesByProject} sessionCounts={sessionCounts} onSelect={onSelect} />)}
              </div>
            </div>)}
            {lanes.length === 0 && <p style={metaLine}>{t('kb.empty')}</p>}
          </div>
        : <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', overflowX: 'auto' }}>
            {flat.map(column => <Column key={column.status} column={column} t={t} versionNames={versionNames} versionProjects={versionProjects} moduleNamesByProject={moduleNamesByProject} sessionCounts={sessionCounts} onSelect={onSelect} />)}
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
  const stat = (value: number, label: string, color?: string) => <div style={{ background: COLORS.panel2, border: `0.5px solid ${COLORS.border}`, borderRadius: 7, padding: '6px 9px' }}><div style={{ fontWeight: 700, fontSize: 15, color: color ?? COLORS.text }}>{String(value)}</div><div style={{ ...metaLine, fontSize: 10.5 }}>{label}</div></div>
  return <div style={{ overflow: 'auto', flex: 1 }}>
    <section style={{ borderBottom: `0.5px solid ${COLORS.border}`, padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('kb.panel')}</h4>
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
      {sessions.map(row => <button key={row.sessionId} type="button" onClick={() => onSelectSession(row.sessionId)} style={{ display: 'flex', gap: 7, alignItems: 'center', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 6, padding: '5px 4px', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: COLORS.green, flex: 'none' }} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 600, overflowWrap: 'anywhere' }}>{row.task.title}</span>
          <span style={{ ...metaLine, display: 'block' }}>{versions.get(row.versionId)?.name ?? ''}</span>
        </span>
      </button>)}
    </section>
    <section style={{ padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('kb.panelReview')}</h4>
      {reviews.length === 0 && <p style={metaLine}>{t('kb.panelNone')}</p>}
      {reviews.map(task => <p key={task.id} style={{ margin: '4px 0', fontSize: 11.5, color: COLORS.dim, overflowWrap: 'anywhere' }}>{task.title}</p>)}
    </section>
  </div>
}

/** Status labels used by the tree and context panel. */
export function statusLabel(status: TaskRecord['status'], t: Translate): string {
  return t(STATUS_META[status].key)
}

/** Ordered statuses shared with the board. */
export { STATUS_ORDER }
