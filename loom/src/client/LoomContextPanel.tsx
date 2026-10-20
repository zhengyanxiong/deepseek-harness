/** Workbench context panel over the selected project, version, task and workspace. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Button, IconBranchOutlineRegular, IconEditOutlineRegular, IconEllipsisOutlineRegular, IconPlusOutlineRegular, IconTrashOutlineRegular, Menu,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CatalogSnapshot, GenerateLockRequest, Lock, ProjectRecord, SourceConfig, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { currentWorkspace, type TokenUsageView } from './projection.ts'
import { LockButton } from './LoomForms.tsx'
import { LoomDeleteDialog, type DeleteKind } from './LoomDeleteDialog.tsx'
import { COLORS, failureReport, sectionTitle, shortCommit, thrownFailureReport, type FailureReport, PRIORITY_META, STATUS_META } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** Inputs for the workbench context panel. */
export interface LoomContextPanelProps {
  readonly t: Translate
  readonly snapshot: CatalogSnapshot
  readonly project: ProjectRecord | undefined
  readonly version: VersionRecord | undefined
  readonly task: TaskRecord | undefined
  readonly presetName?: string | undefined
  readonly usage: TokenUsageView | undefined
  readonly generateLock: (request: GenerateLockRequest) => Promise<RemoteResult<Lock>>
  readonly onLockChanged: () => void
  readonly onEditProject?: () => void
  readonly onNewVersion?: () => void
  readonly onEditVersion?: () => void
  readonly onEditTask?: () => void
  readonly onDeleteProject?: (() => Promise<RemoteResult<void>>) | undefined
  readonly onDeleteVersion?: (() => Promise<RemoteResult<void>>) | undefined
  readonly onDeleteTask?: (() => Promise<RemoteResult<void>>) | undefined
}

const panel: CSSProperties = { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'auto', background: COLORS.panel, borderLeft: `0.5px solid ${COLORS.border}` }
const header: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, padding: '12px 14px 11px', borderBottom: `0.5px solid ${COLORS.border}` }
const eyebrow: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 9.5, fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase' }
const titleRow: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }
const title: CSSProperties = { margin: 0, color: COLORS.text, fontSize: 16, fontWeight: 500, lineHeight: 1.3, overflowWrap: 'anywhere', flex: 1, minWidth: 0 }
const subtitle: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 10.5, lineHeight: 1.4, overflowWrap: 'anywhere' }
const actions: CSSProperties = { display: 'flex', alignItems: 'center', gap: 2, flex: 'none' }
const section: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, padding: '11px 14px', borderBottom: `0.5px solid ${COLORS.border}` }
const iconOnly: CSSProperties = { color: COLORS.faint }
const muted: CSSProperties = { margin: 0, color: COLORS.dim, fontSize: 10.5, lineHeight: 1.5 }
const hint: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 9.5, lineHeight: 1.5 }
const mono: CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 10.5, color: COLORS.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const gitRepo: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, padding: '7px 8px', border: `0.5px solid ${COLORS.border}`, borderRadius: 6, background: COLORS.panel }
const repoHead: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }
const repoName: CSSProperties = { color: COLORS.text, fontSize: 10.5, fontFamily: 'ui-monospace, monospace', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }
const repoPath: CSSProperties = { color: COLORS.faint, fontSize: 9.5, fontFamily: 'ui-monospace, monospace', flex: 'none', maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const graphRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, paddingLeft: 2 }
const dot: CSSProperties = { width: 5, height: 5, borderRadius: '50%', flex: 'none' }
const graphLabel: CSSProperties = { color: COLORS.dim, fontSize: 9.5, flex: 'none' }
const tag: CSSProperties = { display: 'inline-flex', alignItems: 'center', flex: 'none', padding: '1px 5px', borderRadius: 3, background: COLORS.panel3, color: COLORS.dim, fontSize: 9, lineHeight: 1.4 }
const sourceRow: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, padding: '5px 7px', borderRadius: 5, background: COLORS.panel, border: `0.5px solid ${COLORS.border}` }
const sourceTitle: CSSProperties = { color: COLORS.text, fontSize: 10.5, fontFamily: 'ui-monospace, monospace', overflowWrap: 'anywhere' }
const branchLine: CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, color: COLORS.dim, fontSize: 10.5 }
const refChip: CSSProperties = { display: 'inline-flex', alignItems: 'center', minWidth: 0, maxWidth: '100%', padding: '1px 5px', borderRadius: 4, background: COLORS.panel3, color: COLORS.text, fontFamily: 'ui-monospace, monospace', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const moduleRow: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1, padding: '5px 7px', borderRadius: 5, background: COLORS.panel, border: `0.5px solid ${COLORS.border}` }

function SectionHeading({ title: heading, action }: { title: string; action?: ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 20 }}>
    <h4 style={{ ...sectionTitle, marginBottom: 0, fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase' }}>{heading}</h4>
    {action !== undefined && <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>{action}</span>}
  </div>
}

function Row({ k, v, mono: useMono = true }: { k: string; v: string; mono?: boolean }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 11 }}>
    <span style={{ color: COLORS.dim, flex: 'none' }}>{k}</span>
    <span style={{ color: COLORS.text, fontFamily: useMono ? 'ui-monospace, monospace' : 'inherit', fontSize: useMono ? 10.5 : 11, overflowWrap: 'anywhere', textAlign: 'right' }}>{v}</span>
  </div>
}

function IconAction({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return <Button size="sm" variant="ghost" aria-label={label} title={label} icon={icon} onClick={onClick} style={iconOnly} />
}

/** Compact a token count for glanceable right-rail rows while preserving the full value in a title. */
function compactCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

/** Last path segment of a repository path, used as the compact repo name. */
function repoNameOf(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path
}

/** One repository's Lock, version ref and optional workspace branch. */
function RepositoryGraph({ t, source, versionRef, workspaceRef, lock }: {
  t: Translate
  source: SourceConfig
  versionRef: string | undefined
  workspaceRef: string | undefined
  lock: string | undefined
}) {
  const same = versionRef !== undefined && versionRef === workspaceRef
  const versionLabel = t('version.title')
  const workspaceLabel = t('workspace.title')
  return <div style={gitRepo}>
    <div style={repoHead}>
      <span style={repoName} title={source.repo}>{repoNameOf(source.repo)}</span>
      <span style={repoPath} title={source.repo}>{source.path}</span>
    </div>
    <div style={graphRow}>
      <span style={{ ...dot, background: lock === undefined ? COLORS.borderStrong : COLORS.text }} />
      <span style={graphLabel}>{t('lock.title')}</span>
      <span style={{ ...mono, color: lock === undefined ? COLORS.faint : COLORS.text }} title={lock}>{lock ?? t('ctx.noLock')}</span>
    </div>
    {same
      ? <div style={{ ...graphRow, paddingLeft: 10 }}>
        <span style={{ ...dot, background: COLORS.accent }} />
        <span style={refChip} title={versionRef}>{versionRef}</span>
        <span style={tag}>{versionLabel}</span>
        <span style={tag}>{workspaceLabel}</span>
      </div>
      : <>
        <div style={{ ...graphRow, paddingLeft: 10 }}>
          <span style={{ ...dot, background: COLORS.accent }} />
          <span style={graphLabel}>{versionLabel}</span>
          <span style={{ ...mono, color: COLORS.dim }} title={versionRef}>{versionRef ?? t('ctx.noBranch')}</span>
        </div>
        <div style={{ ...graphRow, paddingLeft: 10 }}>
          <span style={{ ...dot, background: COLORS.green }} />
          <span style={graphLabel}>{workspaceLabel}</span>
          <span style={{ ...mono, color: COLORS.dim }} title={workspaceRef}>{workspaceRef ?? t('ctx.noBranch')}</span>
        </div>
      </>}
  </div>
}

/**
 * Render version, Git, task, workspace and cost context without inventing measurements.
 * @param props - catalog records, current selection and owner actions.
 * @returns the aside content for the workbench view.
 */
export function LoomContextPanel({ t, snapshot, project, version, task, usage, generateLock, onLockChanged, onEditProject, onNewVersion, onEditVersion, onEditTask, onDeleteProject, onDeleteVersion, onDeleteTask }: LoomContextPanelProps) {
  const [pendingDelete, setPendingDelete] = useState<DeleteKind>()
  const [deleting, setDeleting] = useState(false)
  const [deleteFailure, setDeleteFailure] = useState<FailureReport>()
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => { setPendingDelete(undefined); setDeleteFailure(undefined); setMenuOpen(false) }, [project?.id, version?.id, task?.id])
  function beginDelete(kind: DeleteKind): void { setPendingDelete(kind); setDeleteFailure(undefined); setMenuOpen(false) }
  async function confirmDelete(): Promise<void> {
    const callback = pendingDelete === 'project' ? onDeleteProject : pendingDelete === 'version' ? onDeleteVersion : pendingDelete === 'task' ? onDeleteTask : undefined
    if (callback === undefined) return
    setDeleting(true); setDeleteFailure(undefined)
    try {
      const result = await callback()
      if (result.ok) setPendingDelete(undefined)
      else setDeleteFailure(failureReport(result.error.code, result.error.message))
    } catch (error) {
      setDeleteFailure(thrownFailureReport(error))
    } finally { setDeleting(false) }
  }
  const pendingSubject = pendingDelete === 'project' ? project?.config.name : pendingDelete === 'version' ? version?.name : task?.title
  const latestLock = version === undefined ? undefined : snapshot.locks.filter(lock => lock.versionId === version.id).at(-1)
  const workspace = currentWorkspace(snapshot, task)
  const projectSource = (sourceId: string) => project?.config.sources.find(source => source.id === sourceId)
  const versionRef = (source: SourceConfig): string | undefined => version?.sources.find(entry => entry.sourceId === source.id)?.ref
  const workspaceRef = (source: SourceConfig): string | undefined => workspace?.branches?.[source.id]
  const lockCommit = (source: SourceConfig): string | undefined => latestLock?.repositories.find(entry => entry.sourceId === source.id)?.commit.slice(0, 7)
  const moreItems: MenuEntry[] = []
  if (onEditProject !== undefined) moreItems.push({ id: 'edit-project', label: t('project.edit'), icon: <IconEditOutlineRegular /> })
  if (onNewVersion !== undefined) moreItems.push({ id: 'new-version', label: t('version.new'), icon: <IconPlusOutlineRegular /> })
  if (version !== undefined && onDeleteVersion !== undefined) moreItems.push({ type: 'separator', id: 'sep-version' }, { id: 'delete-version', label: t('version.delete'), icon: <IconTrashOutlineRegular />, danger: true })
  if (project !== undefined && onDeleteProject !== undefined) moreItems.push({ id: 'delete-project', label: t('project.delete'), icon: <IconTrashOutlineRegular />, danger: true })
  if (task !== undefined && onDeleteTask !== undefined) moreItems.push({ type: 'separator', id: 'sep-task' }, { id: 'delete-task', label: t('task.delete'), icon: <IconTrashOutlineRegular />, danger: true })
  function selectMenu(id: string): void {
    setMenuOpen(false)
    if (id === 'edit-project') onEditProject?.()
    else if (id === 'new-version') onNewVersion?.()
    else if (id === 'delete-version') beginDelete('version')
    else if (id === 'delete-project') beginDelete('project')
    else if (id === 'delete-task') beginDelete('task')
  }
  const editAction = version !== undefined ? onEditVersion : onEditProject
  const editLabel = version !== undefined ? t('version.edit') : t('project.edit')
  const count = project?.config.sources.length ?? 0
  return <div style={panel}>
    <header style={header}>
      <p style={eyebrow}>{t('ctx.version')}</p>
      <div style={titleRow}>
        <h3 style={title}>{version?.name ?? project?.config.name ?? t('ctx.none')}</h3>
        <div style={actions}>
          {editAction !== undefined && <IconAction label={editLabel} icon={<IconEditOutlineRegular />} onClick={editAction} />}
          {moreItems.length > 0 && <Menu open={menuOpen} onClose={() => setMenuOpen(false)} items={moreItems} align="end" portal
            onSelect={selectMenu}
            anchor={<Button size="sm" variant="ghost" aria-label={t('ctx.more')} title={t('ctx.more')} icon={<IconEllipsisOutlineRegular />} onClick={() => setMenuOpen(value => !value)} style={iconOnly} />} />}
        </div>
      </div>
      {project !== undefined && <p style={subtitle}>{project.config.name}</p>}
    </header>
    {project === undefined ? <section style={section}><p style={muted}>{snapshot.projects.length === 0 ? t('project.empty') : t('ctx.selectProject')}</p></section> : <>
      <section style={section}>
        <SectionHeading title={t('ctx.git')} action={<span style={{ ...hint, fontFamily: 'ui-monospace, monospace' }}>{t('ctx.lockRepos').replace('{count}', String(count))}</span>} />
        {project.config.sources.map(source => <RepositoryGraph key={source.id} t={t} source={source}
          versionRef={versionRef(source)} workspaceRef={workspaceRef(source)} lock={lockCommit(source)} />)}
        {version !== undefined && <div style={{ marginTop: 2 }}>
          <LockButton t={t} version={version} generate={generateLock} onCreated={onLockChanged} existing={latestLock !== undefined} disabled={task?.status === 'running'} hint={false} />
          <p style={hint}>{t('ctx.gitHint')}</p>
        </div>}
      </section>
      {task !== undefined && <section style={section}>
        <SectionHeading title={t('task.details')} action={onEditTask === undefined ? undefined : <IconAction label={t('task.edit')} icon={<IconEditOutlineRegular />} onClick={onEditTask} />} />
        <Row k={t('task.name')} v={task.title} mono={false} />
        <Row k={t('ctx.status')} v={t(STATUS_META[task.status].key)} mono={false} />
        <Row k={t('task.priority')} v={t(PRIORITY_META[task.priority ?? 'normal'].key)} mono={false} />
        <Row k={t('attempt.current')} v={String(task.attempts.length)} />
      </section>}
      <section style={section}>
        <SectionHeading title={t('ctx.workspace')} />
        {workspace === undefined ? <p style={muted}>{t('workspace.empty')}</p> : <>
          <Row k={t('workspace.path')} v={workspace.path} />
          <Row k={t('ctx.lock')} v={shortCommit(snapshot.locks.find(lock => lock.id === workspace.lockId)) ?? workspace.lockId} />
          <p style={{ ...hint, margin: '2px 0 0' }}>{t('ctx.branch')} · {t('ctx.readOnly')}</p>
          {project.config.sources.map(source => <div key={source.id} style={sourceRow}>
            <span style={sourceTitle}>{source.path}</span>
            <span style={branchLine}><IconBranchOutlineRegular size={11} /><span style={refChip} title={workspace.branches?.[source.id]}>{workspaceRef(source) ?? t('ctx.noBranch')}</span></span>
          </div>)}
        </>}
      </section>
      <section style={section}>
        <SectionHeading title={t('ctx.modules')} action={<span style={hint}>{String(project.config.modules.length)}</span>} />
        {project.config.modules.length === 0 ? <p style={muted}>{t('task.noModules')}</p> : project.config.modules.map(module => {
          const source = projectSource(module.sourceId)
          return <div key={module.id} style={moduleRow}>
            <span style={{ color: COLORS.text, fontSize: 10.5, overflowWrap: 'anywhere' }}>{module.path}</span>
            <span style={{ color: COLORS.faint, fontSize: 9.5, overflowWrap: 'anywhere' }}>{source?.path ?? module.sourceId}</span>
          </div>
        })}
      </section>
      <section style={section}>
        <SectionHeading title={t('ctx.tests')} />
        <p style={muted}>{t('ctx.notRun')}</p>
      </section>
      <section style={{ ...section, borderBottom: 'none' }}>
        <SectionHeading title={t('ctx.costs')} />
        {usage === undefined ? <p style={muted}>{t('ctx.notTracked')}</p> : <>
          <Row k={t('ctx.usageInput')} v={compactCount(usage.uncachedInputTokens)} />
          <Row k={t('ctx.usageOutput')} v={compactCount(usage.outputTokens)} />
          <Row k={t('ctx.usageCached')} v={compactCount(usage.cacheReadTokens + usage.cacheWriteTokens)} />
          <Row k={t('ctx.usageTotal')} v={compactCount(usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens)} />
          <p style={hint}>{t('ctx.usageNote')}</p>
        </>}
      </section>
    </>}
    {pendingDelete !== undefined && <LoomDeleteDialog t={t} kind={pendingDelete} subject={pendingSubject} busy={deleting} failure={deleteFailure} onCancel={() => { setPendingDelete(undefined); setDeleteFailure(undefined) }} onConfirm={() => { void confirmDelete() }} />}
  </div>
}
