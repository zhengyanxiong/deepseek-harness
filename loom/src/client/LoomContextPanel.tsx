/** Workbench context panel over the selected project, version, task and workspace. */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CatalogSnapshot, GenerateLockRequest, Lock, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-loom/types'
import { boundSessions, currentLock, currentWorkspace } from './projection.ts'
import { LockButton } from './LoomForms.tsx'
import { COLORS, metaLine, sectionTitle, shortCommit, STATUS_META } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** Inputs for the workbench context panel. */
export interface LoomContextPanelProps {
  readonly t: Translate
  readonly snapshot: CatalogSnapshot
  readonly project: ProjectRecord | undefined
  readonly version: VersionRecord | undefined
  readonly task: TaskRecord | undefined
  readonly generateLock: (request: GenerateLockRequest) => Promise<RemoteResult<Lock>>
  readonly onLockChanged: () => void
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
export function LoomContextPanel({ t, snapshot, project, version, task, generateLock, onLockChanged }: LoomContextPanelProps) {
  const lock = currentLock(snapshot, task)
  const workspace = currentWorkspace(snapshot, task)
  const sessions = boundSessions(snapshot).filter(row => row.task.id === task?.id)
  const refs = version?.sources.map(source => `${source.sourceId}@${source.ref}`).join(' · ') ?? ''
  return <div style={{ overflow: 'auto', flex: 1 }}>
    <section style={{ borderBottom: `0.5px solid ${COLORS.border}`, padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('ctx.project')}</h4>
      {project === undefined ? <p style={metaLine}>{t('ctx.none')}</p> : <>
        <Row k={t('top.project')} v={project.config.name} />
        <Row k={t('top.version')} v={version === undefined ? '—' : refs === '' ? version.name : `${version.name} · ${refs}`} />
        <Row k={t('ctx.lock')} v={shortCommit(lock) ?? '—'} />
        <Row k={t('ctx.workspace')} v={workspace?.path ?? '—'} />
        <Row k={t('ctx.status')} v={task === undefined ? '—' : t(STATUS_META[task.status].key)} />
        <Row k={t('sessions')} v={String(sessions.length)} />
        {version !== undefined && <LockButton t={t} version={version} generate={generateLock} onCreated={onLockChanged} />}
      </>}
    </section>
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
        {project.config.sources.map(source => <div key={source.id}><span style={{ color: '#7db3ff' }}>{source.id}</span> → <span style={{ color: COLORS.cyan }}>{source.path}</span></div>)}
      </div>
    </section>}
    <section style={{ borderBottom: `0.5px solid ${COLORS.border}`, padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('ctx.tests')}</h4>
      <p style={metaLine}>{t('ctx.notRun')}</p>
    </section>
    <section style={{ padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('ctx.costs')}</h4>
      <p style={metaLine}>{t('ctx.notTracked')}</p>
    </section>
  </div>
}
