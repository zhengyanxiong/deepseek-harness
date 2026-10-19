/** Workbench context panel over the selected project, version, task and workspace. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Button, IconBranchOutlineRegular, IconEditOutlineRegular, IconPlusOutlineRegular, IconTrashOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CatalogSnapshot, GenerateLockRequest, Lock, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
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
const header: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 14px 12px', borderBottom: `0.5px solid ${COLORS.border}` }
const eyebrow: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 10.5, fontWeight: 500, letterSpacing: '.06em', textTransform: 'uppercase' }
const title: CSSProperties = { margin: 0, color: COLORS.text, fontSize: 16, fontWeight: 500, lineHeight: 1.35, overflowWrap: 'anywhere' }
const section: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 7, padding: '12px 14px', borderBottom: `0.5px solid ${COLORS.border}` }
const actions: CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }
const iconOnly: CSSProperties = { color: COLORS.faint }
const sourceRow: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, padding: '7px 8px', borderRadius: 'var(--dsw-radius-sm)', border: `0.5px solid ${COLORS.border}`, background: COLORS.panel2 }
const sourceTitle: CSSProperties = { color: COLORS.text, fontSize: 11.5, fontFamily: 'ui-monospace, monospace', overflowWrap: 'anywhere' }
const branchLine: CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, color: COLORS.dim, fontSize: 11.5 }
const refChip: CSSProperties = { display: 'inline-flex', alignItems: 'center', minWidth: 0, maxWidth: '100%', padding: '1px 6px', borderRadius: 4, background: COLORS.panel3, color: COLORS.text, fontFamily: 'ui-monospace, monospace', fontSize: 10.5, overflowWrap: 'anywhere' }
const muted: CSSProperties = { margin: 0, color: COLORS.dim, fontSize: 11.5, lineHeight: 1.55 }
const moduleRow: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 8px', borderRadius: 'var(--dsw-radius-sm)', background: COLORS.panel2, border: `0.5px solid ${COLORS.border}` }

function SectionHeading({ title: heading, action }: { title: string; action?: ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 24 }}>
    <h4 style={{ ...sectionTitle, marginBottom: 0 }}>{heading}</h4>
    {action !== undefined && <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>{action}</span>}
  </div>
}

function Row({ k, v, mono = true }: { k: string; v: string; mono?: boolean }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 12 }}>
    <span style={{ color: COLORS.dim, flex: 'none' }}>{k}</span>
    <span style={{ color: COLORS.text, fontFamily: mono ? 'ui-monospace, monospace' : 'inherit', fontSize: mono ? 11.5 : 12, overflowWrap: 'anywhere', textAlign: 'right' }}>{v}</span>
  </div>
}

function IconAction({ label, icon, onClick, danger = false }: { label: string; icon: ReactNode; onClick: () => void; danger?: boolean }) {
  return <Button size="sm" variant="ghost" aria-label={label} title={label} icon={icon} onClick={onClick}
    style={danger ? { color: COLORS.error } : iconOnly} />
}

/**
 * Render project, version, task, workspace and cost context without inventing measurements.
 * @param props - catalog records, current selection and owner actions.
 * @returns the aside content for the workbench view.
 */
export function LoomContextPanel({ t, snapshot, project, version, task, presetName, usage, generateLock, onLockChanged, onEditProject, onNewVersion, onEditVersion, onEditTask, onDeleteProject, onDeleteVersion, onDeleteTask }: LoomContextPanelProps) {
  const [pendingDelete, setPendingDelete] = useState<DeleteKind>()
  const [deleting, setDeleting] = useState(false)
  const [deleteFailure, setDeleteFailure] = useState<FailureReport>()
  useEffect(() => { setPendingDelete(undefined); setDeleteFailure(undefined) }, [project?.id, version?.id, task?.id])
  function beginDelete(kind: DeleteKind): void { setPendingDelete(kind); setDeleteFailure(undefined) }
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
  const locks = version === undefined ? [] : snapshot.locks.filter(lock => lock.versionId === version.id)
  const latestLock = locks.at(-1)
  const workspace = currentWorkspace(snapshot, task)
  const projectSource = (sourceId: string) => project?.config.sources.find(source => source.id === sourceId)
  const versions = project === undefined ? [] : snapshot.versions.filter(candidate => candidate.projectId === project.id)
  return <div style={panel}>
    <header style={header}>
      <p style={eyebrow}>{t('ctx.project')}</p>
      <h3 style={title}>{project?.config.name ?? t('ctx.none')}</h3>
      {project !== undefined && <div style={actions}>
        {onEditProject !== undefined && <Button size="sm" variant="outline" icon={<IconEditOutlineRegular />} onClick={onEditProject}>{t('project.edit')}</Button>}
        {onNewVersion !== undefined && <Button size="sm" variant="outline" icon={<IconPlusOutlineRegular />} onClick={onNewVersion}>{t('version.new')}</Button>}
        {onDeleteProject !== undefined && <IconAction label={t('project.delete')} icon={<IconTrashOutlineRegular />} danger onClick={() => beginDelete('project')} />}
      </div>}
    </header>
    {project === undefined ? <section style={section}><p style={muted}>{t('project.empty')}</p></section> : <>
      <section style={section}>
        <SectionHeading title={t('project.configuration')} />
        <Row k={t('project.name')} v={project.config.name} mono={false} />
        <Row k={t('project.agentPreset')} v={presetName ?? t('project.agentPresetDefault')} mono={false} />
        <Row k={t('version.title')} v={String(versions.length)} />
      </section>
      <section style={section}>
        <SectionHeading title={t('version.detail')} action={<>
          {version !== undefined && onEditVersion !== undefined && <IconAction label={t('version.edit')} icon={<IconEditOutlineRegular />} onClick={onEditVersion} />}
          {version !== undefined && onDeleteVersion !== undefined && <IconAction label={t('version.delete')} icon={<IconTrashOutlineRegular />} danger onClick={() => beginDelete('version')} />}
        </>} />
        {version === undefined ? <p style={muted}>{t('version.select')}</p> : <>
          <Row k={t('version.name')} v={version.name} mono={false} />
          <p style={{ ...muted, margin: '2px 0 0' }}>{t('version.repositories')}</p>
          {version.sources.map(entry => {
            const source = projectSource(entry.sourceId)
            return <div key={entry.sourceId} style={sourceRow}>
              <span style={sourceTitle}>{source?.path ?? entry.sourceId}</span>
              <span style={branchLine}><IconBranchOutlineRegular size={12} /><span style={refChip}>{entry.ref}</span></span>
              {source !== undefined && <span style={{ ...muted, fontSize: 10.5, overflowWrap: 'anywhere' }}>{source.repo}</span>}
            </div>
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ ...muted, flex: 1 }}>{latestLock === undefined ? t('lock.empty') : `${t('lock.title')} · ${shortCommit(latestLock) ?? latestLock.id.slice(0, 8)}`}</span>
          </div>
          <LockButton t={t} version={version} generate={generateLock} onCreated={onLockChanged} existing={latestLock !== undefined} disabled={task?.status === 'running'} />
          {latestLock !== undefined && <p style={{ ...muted, fontSize: 10.5 }}>{t('lock.immutable')}</p>}
        </>}
      </section>
      {task !== undefined && <section style={section}>
        <SectionHeading title={t('task.details')} action={<>
          {onEditTask !== undefined && <IconAction label={t('task.edit')} icon={<IconEditOutlineRegular />} onClick={onEditTask} />}
          {onDeleteTask !== undefined && <IconAction label={t('task.delete')} icon={<IconTrashOutlineRegular />} danger onClick={() => beginDelete('task')} />}
        </>} />
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
          <p style={{ ...muted, margin: '3px 0 0' }}>{t('ctx.branch')}</p>
          {project.config.sources.map(source => <div key={source.id} style={sourceRow}>
            <span style={sourceTitle}>{source.path}</span>
            <span style={branchLine}><IconBranchOutlineRegular size={12} /><span style={refChip}>{workspace.branches?.[source.id] ?? t('ctx.noBranch')}</span></span>
          </div>)}
        </>}
      </section>
      <section style={section}>
        <SectionHeading title={t('ctx.modules')} />
        {project.config.modules.length === 0 ? <p style={muted}>{t('task.noModules')}</p> : project.config.modules.map(module => {
          const source = projectSource(module.sourceId)
          return <div key={module.id} style={moduleRow}>
            <span style={{ color: COLORS.text, fontSize: 11.5, overflowWrap: 'anywhere' }}>{module.path}</span>
            <span style={{ color: COLORS.faint, fontSize: 10.5, overflowWrap: 'anywhere' }}>{source?.path ?? module.sourceId}</span>
          </div>
        })}
      </section>
      <section style={section}>
        <SectionHeading title={t('ctx.tests')} />
        <p style={muted}>{t('ctx.notRun')}</p>
      </section>
      <section style={section}>
        <SectionHeading title={t('ctx.costs')} />
        {usage === undefined ? <p style={muted}>{t('ctx.notTracked')}</p> : <>
          <Row k={t('ctx.usageInput')} v={String(usage.uncachedInputTokens)} />
          <Row k={t('ctx.usageOutput')} v={String(usage.outputTokens)} />
          <Row k={t('ctx.usageCached')} v={String(usage.cacheReadTokens + usage.cacheWriteTokens)} />
          <Row k={t('ctx.usageTotal')} v={String(usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens)} />
          <p style={{ ...muted, margin: '2px 0 0', fontSize: 10.5 }}>{t('ctx.usageNote')}</p>
        </>}
      </section>
    </>}
    {pendingDelete !== undefined && <LoomDeleteDialog t={t} kind={pendingDelete} subject={pendingSubject} busy={deleting} failure={deleteFailure} onCancel={() => { setPendingDelete(undefined); setDeleteFailure(undefined) }} onConfirm={() => { void confirmDelete() }} />}
  </div>
}
