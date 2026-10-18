/** Workbench context panel over the selected project, version, task and workspace. */
import type { ReactNode } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CatalogSnapshot, GenerateLockRequest, Lock, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { boundSessions, currentLock, currentWorkspace, type TokenUsageView } from './projection.ts'
import { LockButton } from './LoomForms.tsx'
import { COLORS, metaLine, sectionTitle, shortCommit, PRIORITY_META, STATUS_META } from './shell.ts'
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
}

const editLink = { border: 'none', background: 'transparent', color: COLORS.accent, cursor: 'pointer', font: 'inherit', fontSize: 11, padding: 0 } as const

function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
 * @param props - catalog records and current selection.
 * @returns the aside content for the workbench view.
 */
export function LoomContextPanel({ t, snapshot, project, version, task, usage, generateLock, onLockChanged, onEditProject, onEditVersion, onEditTask }: LoomContextPanelProps) {
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
      <SectionHeading title={t('ctx.project')} action={project !== undefined && onEditProject !== undefined ? <button type="button" style={editLink} onClick={onEditProject}>{t('form.edit')} · {t('project.title')}</button> : undefined} />
      {project === undefined ? <p style={metaLine}>{t('ctx.none')}</p> : <>
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
        {task !== undefined && onEditTask !== undefined && <button type="button" style={{ ...editLink, marginTop: 6 }} onClick={onEditTask}>{t('form.edit')} · {t('task.title')}</button>}
      </>}
    </section>
    {version !== undefined && <section style={{ borderBottom: `0.5px solid ${COLORS.border}`, padding: '10px 14px' }}>
      <SectionHeading title={t('version.detail')} action={onEditVersion === undefined ? undefined : <button type="button" style={editLink} onClick={onEditVersion}>{t('form.edit')}</button>} />
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
