/** Workbench context panel over the selected project, version, task and workspace. */
import { useEffect, useState, type ReactNode } from 'react'
import { Button, IconEditOutlineRegular, IconTrashOutlineRegular, IconWarningTriangleOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CatalogSnapshot, GenerateLockRequest, Lock, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { boundSessions, currentLock, currentWorkspace, type TokenUsageView } from './projection.ts'
import { LockButton } from './LoomForms.tsx'
import { COLORS, failureKey, metaLine, sectionTitle, shortCommit, PRIORITY_META, STATUS_META } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** Inputs for the workbench context panel. */
export interface LoomContextPanelProps {
  readonly t: Translate
  readonly snapshot: CatalogSnapshot
  readonly project: ProjectRecord | undefined
  readonly version: VersionRecord | undefined
  readonly task: TaskRecord | undefined
  readonly usage: TokenUsageView | undefined
  readonly generateLock: (request: GenerateLockRequest) => Promise<RemoteResult<Lock>>
  readonly onLockChanged: () => void
  readonly onEditProject?: () => void
  readonly onEditVersion?: () => void
  readonly onEditTask?: () => void
  readonly onDeleteProject?: (() => Promise<RemoteResult<void>>) | undefined
  readonly onDeleteVersion?: (() => Promise<RemoteResult<void>>) | undefined
  readonly onDeleteTask?: (() => Promise<RemoteResult<void>>) | undefined
}

type DeleteKind = 'project' | 'version' | 'task'

const DELETE_COPY: Readonly<Record<DeleteKind, { readonly label: LoomKey; readonly warning: LoomKey }>> = {
  project: { label: 'project.delete', warning: 'delete.projectWarning' },
  version: { label: 'version.delete', warning: 'delete.versionWarning' },
  task: { label: 'task.delete', warning: 'delete.taskWarning' },
}
const dangerAction = { color: COLORS.error, borderColor: COLORS.error } as const
const confirmPanel = { display: 'flex', flexDirection: 'column', gap: 8, margin: '0 0 10px', padding: 10, border: `0.5px solid ${COLORS.error}`, borderRadius: 'var(--dsw-radius-sm)', background: 'var(--dsw-alias-interactive-bg-hover-danger)' } as const
const confirmHeading = { display: 'flex', alignItems: 'center', gap: 6, color: COLORS.error, fontSize: 12, fontWeight: 500 } as const

function DeleteConfirm({ kind, t, subject, busy, failure, onCancel, onConfirm }: {
  readonly kind: DeleteKind
  readonly t: Translate
  readonly subject: string | undefined
  readonly busy: boolean
  readonly failure: string | undefined
  readonly onCancel: () => void
  readonly onConfirm: () => void
}) {
  const failureMessage = failure === undefined ? undefined : (() => {
    const key = failureKey(failure)
    return key === undefined ? t('state.error') : t(key)
  })()
  return <div role="group" aria-label={t('delete.confirmTitle')} style={confirmPanel}>
    <div style={confirmHeading}><IconWarningTriangleOutlineRegular size={14} /><span>{t(DELETE_COPY[kind].label)}</span></div>
    <div style={{ color: COLORS.text, fontSize: 12, overflowWrap: 'anywhere' }}>{subject ?? '—'}</div>
    <p style={{ margin: 0, color: COLORS.dim, fontSize: 11.5, lineHeight: 1.55 }}>{t(DELETE_COPY[kind].warning)}</p>
    {failureMessage !== undefined && <p role="alert" style={{ margin: 0, color: COLORS.error, fontSize: 11.5, lineHeight: 1.55 }}>{failureMessage}</p>}
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>{t('form.cancel')}</Button>
      <Button size="sm" variant="outline" disabled={busy} style={{ ...dangerAction, marginLeft: 'auto' }} onClick={onConfirm}>{busy ? t('delete.deleting') : t('delete.confirmAction')}</Button>
    </div>
  </div>
}

function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
    <h4 style={{ ...sectionTitle, marginBottom: 0 }}>{title}</h4>
    {action !== undefined && <span style={{ marginLeft: 'auto' }}>{action}</span>}
  </div>
}

function Row({ k, v }: { k: string; v: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 0', fontSize: 12 }}>
    <span style={{ color: COLORS.dim }}>{k}</span>
    <span style={{ color: COLORS.text, fontFamily: 'ui-monospace, monospace', fontSize: 11.5, overflowWrap: 'anywhere', textAlign: 'right' }}>{v}</span>
  </div>
}

/**
 * Render project, module, workspace and cost context without inventing measurements.
 * @param props - catalog records, current selection and owner actions.
 * @returns the aside content for the workbench view.
 */
export function LoomContextPanel({ t, snapshot, project, version, task, usage, generateLock, onLockChanged, onEditProject, onEditVersion, onEditTask, onDeleteProject, onDeleteVersion, onDeleteTask }: LoomContextPanelProps) {
  const [pendingDelete, setPendingDelete] = useState<DeleteKind>()
  const [deleting, setDeleting] = useState(false)
  const [deleteFailure, setDeleteFailure] = useState<string>()
  useEffect(() => { setPendingDelete(undefined); setDeleteFailure(undefined) }, [project?.id, version?.id, task?.id])
  function beginDelete(kind: DeleteKind): void { setPendingDelete(kind); setDeleteFailure(undefined) }
  async function confirmDelete(): Promise<void> {
    const callback = pendingDelete === 'project' ? onDeleteProject : pendingDelete === 'version' ? onDeleteVersion : pendingDelete === 'task' ? onDeleteTask : undefined
    if (callback === undefined) return
    setDeleting(true); setDeleteFailure(undefined)
    try {
      const result = await callback()
      if (result.ok) setPendingDelete(undefined)
      else setDeleteFailure(result.error.message)
    } catch (error) {
      setDeleteFailure(error instanceof Error ? error.message : String(error))
    } finally { setDeleting(false) }
  }
  const pendingSubject = pendingDelete === 'project' ? project?.config.name : pendingDelete === 'version' ? version?.name : pendingDelete === 'task' ? task?.title : undefined
  const lock = currentLock(snapshot, task)
  const versionLocks = version === undefined ? [] : snapshot.locks.filter(candidate => candidate.versionId === version.id)
  const displayLock = lock ?? versionLocks.at(-1)
  const workspace = currentWorkspace(snapshot, task)
  const sessions = boundSessions(snapshot).filter(row => row.task.id === task?.id)
  const refs = version?.sources.map(source => `${source.sourceId}@${source.ref}`).join(' · ') ?? ''
  const priority = task?.priority ?? 'normal'
  const taskModules = (task?.moduleIds ?? []).map(moduleId => project?.config.modules.find(module => module.id === moduleId)?.path ?? moduleId)
  return <div style={{ overflow: 'auto', flex: 1 }}>
    <section style={{ borderBottom: `0.5px solid ${COLORS.border}`, padding: '10px 14px' }}>
      <SectionHeading title={t('ctx.project')} />
      {project === undefined ? <p style={metaLine}>{t('ctx.none')}</p> : <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {onEditProject !== undefined && <Button size="sm" variant="outline" icon={<IconEditOutlineRegular />} onClick={onEditProject}>{t('project.edit')}</Button>}
          {onDeleteProject !== undefined && <Button size="sm" variant="outline" icon={<IconTrashOutlineRegular />} style={dangerAction} disabled={deleting} onClick={() => beginDelete('project')}>{t('project.delete')}</Button>}
          {task !== undefined && onEditTask !== undefined && <Button size="sm" variant="outline" icon={<IconEditOutlineRegular />} onClick={onEditTask}>{t('task.edit')}</Button>}
          {task !== undefined && onDeleteTask !== undefined && <Button size="sm" variant="outline" icon={<IconTrashOutlineRegular />} style={dangerAction} disabled={deleting} onClick={() => beginDelete('task')}>{t('task.delete')}</Button>}
        </div>
        {pendingDelete !== undefined && <DeleteConfirm kind={pendingDelete} t={t} subject={pendingSubject} busy={deleting} failure={deleteFailure} onCancel={() => { setPendingDelete(undefined); setDeleteFailure(undefined) }} onConfirm={() => { void confirmDelete() }} />}
        <Row k={t('top.project')} v={project.config.name} />
        <Row k={t('top.version')} v={version === undefined ? '—' : refs === '' ? version.name : `${version.name} · ${refs}`} />
        <Row k={t('ctx.lock')} v={shortCommit(displayLock) ?? '—'} />
        <Row k={t('ctx.workspace')} v={workspace?.path ?? '—'} />
        <Row k={t('ctx.branch')} v={Object.values(workspace?.branches ?? {}).join(' · ') || '—'} />
        <Row k={t('ctx.status')} v={task === undefined ? '—' : t(STATUS_META[task.status].key)} />
        {task !== undefined && <>
          <Row k={t('task.priority')} v={t(PRIORITY_META[priority].key)} />
          <Row k={t('task.modules')} v={taskModules.length === 0 ? '—' : taskModules.join(' · ')} />
        </>}
        <Row k={t('sessions')} v={String(sessions.length)} />
        {task?.description !== undefined && task.description !== '' && <p style={{ margin: '8px 0 0', padding: '7px 9px', borderRadius: 7, background: COLORS.panel2, color: COLORS.dim, fontSize: 11.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{task.description}</p>}
        {version !== undefined && <LockButton t={t} version={version} generate={generateLock} onCreated={onLockChanged} />}
      </>}
    </section>
    {version !== undefined && <section style={{ borderBottom: `0.5px solid ${COLORS.border}`, padding: '10px 14px' }}>
      <SectionHeading title={t('version.detail')} />
      {(onEditVersion !== undefined || onDeleteVersion !== undefined) && <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {onEditVersion !== undefined && <Button size="sm" variant="outline" icon={<IconEditOutlineRegular />} onClick={onEditVersion}>{t('version.edit')}</Button>}
        {onDeleteVersion !== undefined && <Button size="sm" variant="outline" icon={<IconTrashOutlineRegular />} style={dangerAction} disabled={deleting} onClick={() => beginDelete('version')}>{t('version.delete')}</Button>}
      </div>}
      <Row k={t('version.name')} v={version.name} />
      <Row k={t('version.repositories')} v={String(version.sources.length)} />
      {version.sources.map(source => <Row key={source.sourceId} k={source.sourceId} v={source.ref} />)}
      <Row k={t('lock.title')} v={String(versionLocks.length)} />
      {displayLock?.repositories.map(repository => <Row key={repository.sourceId} k={repository.sourceId} v={repository.commit.slice(0, 8)} />)}
    </section>}
    {project !== undefined && <section style={{ borderBottom: `0.5px solid ${COLORS.border}`, padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('ctx.modules')}</h4>
      {project.config.modules.length === 0 && <p style={metaLine}>{t('side.empty')}</p>}
      {project.config.modules.map(module => <div key={module.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', border: `0.5px solid ${COLORS.border}`, borderRadius: 7, marginBottom: 6, background: COLORS.panel2 }}>
        <span>📦</span>
        <span style={{ fontWeight: 600, fontSize: 12 }}>{module.id}</span>
        <span style={{ ...metaLine, marginLeft: 'auto', fontFamily: 'ui-monospace, monospace' }}>{module.path}</span>
        <span style={{ color: COLORS.green, fontSize: 12 }}>✓</span>
      </div>)}
    </section>}
    {project !== undefined && <section style={{ borderBottom: `0.5px solid ${COLORS.border}`, padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('ctx.repos')}</h4>
      <div style={{ fontSize: 11.5, color: COLORS.dim, lineHeight: 2, fontFamily: 'ui-monospace, monospace' }}>
        {project.config.sources.map(source => <div key={source.id}><span style={{ color: '#7db3ff' }}>{source.id}</span> → <span style={{ color: COLORS.cyan }}>{source.path}</span><div style={{ paddingLeft: 12, color: COLORS.text }}>{workspace?.branches?.[source.id] ?? t('ctx.noBranch')}</div></div>)}
      </div>
    </section>}
    <section style={{ borderBottom: `0.5px solid ${COLORS.border}`, padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('ctx.tests')}</h4>
      <p style={metaLine}>{t('ctx.notRun')}</p>
    </section>
    <section style={{ padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('ctx.costs')}</h4>
      {usage === undefined ? <p style={metaLine}>{t('ctx.notTracked')}</p> : <>
        <Row k={t('ctx.usageInput')} v={String(usage.uncachedInputTokens)} />
        <Row k={t('ctx.usageOutput')} v={String(usage.outputTokens)} />
        <Row k={t('ctx.usageCached')} v={String(usage.cacheReadTokens + usage.cacheWriteTokens)} />
        <Row k={t('ctx.usageTotal')} v={String(usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens)} />
        <p style={{ ...metaLine, margin: '6px 0 0' }}>{t('ctx.usageNote')}</p>
      </>}
    </section>
  </div>
}
