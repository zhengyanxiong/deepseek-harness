/** Task-centred Workbench page: description, acceptance, execution and recent activity. */
import type { CSSProperties, ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AuditEntry, CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { ACTOR_LABEL, AUDIT_LABEL, COLORS, metaLine, PRIORITY_META, STATUS_META } from './shell.ts'
import type { LoomKey } from './locales.ts'
import type { LoadWorkspaceChanges } from './LoomDiff.tsx'
import { ExecutionPanel, type ExecutionActions } from './LoomExecution.tsx'

type Translate = (key: LoomKey) => string

const shell: CSSProperties = { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: COLORS.panel }
const head: CSSProperties = { flex: 'none', height: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', borderBottom: `0.5px solid ${COLORS.border}`, background: COLORS.panel }
const page: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '18px 22px 22px' }
const stack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 720, margin: '0 auto' }
const titleLine: CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5, minWidth: 0 }
const title: CSSProperties = { margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, lineHeight: 1.35, fontWeight: 500, color: COLORS.text }
const card: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, padding: '15px 16px', background: COLORS.panel, border: `0.5px solid ${COLORS.border}`, borderRadius: 10, boxShadow: '0 1px 2px rgba(15,17,21,.03)' }
const sectionHeading: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, margin: 0, ...metaLine, fontFamily: 'ui-monospace, monospace', fontSize: 8.5, letterSpacing: '.12em', textTransform: 'uppercase', color: COLORS.faint }
const chip: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 7px', border: `0.5px solid ${COLORS.border}`, borderRadius: 5, color: COLORS.dim, fontSize: 10, whiteSpace: 'nowrap' }
const fieldGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }
const fieldLabel: CSSProperties = { ...metaLine, fontFamily: 'ui-monospace, monospace', fontSize: 8.5, letterSpacing: '.08em', textTransform: 'uppercase' }
const fieldValue: CSSProperties = { minWidth: 0, overflowWrap: 'anywhere', color: COLORS.text, fontSize: 11, lineHeight: 1.5 }
const muted: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 12, lineHeight: 1.6 }
const description: CSSProperties = { margin: 0, color: COLORS.dim, fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
const acceptanceList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 7, margin: 0, padding: 0, listStyle: 'none' }
const acceptanceRow: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0, color: COLORS.dim, fontSize: 12, lineHeight: 1.55 }
const check: CSSProperties = { flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, marginTop: 2, borderRadius: 999, border: `1px solid ${COLORS.borderStrong}`, borderColor: COLORS.borderStrong, background: 'transparent', color: COLORS.green, fontSize: 9 }
const activityList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 }
const activityRow: CSSProperties = { display: 'grid', gridTemplateColumns: '54px minmax(0, 1fr)', gap: 9, alignItems: 'baseline', minWidth: 0, fontSize: 10.5, color: COLORS.faint }
const activityTitle: CSSProperties = { ...sectionHeading, padding: '2px 2px 0' }

/** Parse markdown checklist lines from the task description; nothing else is presented as acceptance. */
function acceptanceItems(description: string): readonly { readonly text: string; readonly done: boolean }[] {
  return description.split(/\r?\n/u).flatMap(line => {
    const match = /^\s*[-*]\s*\[([ xX])\]\s+(.+)$/u.exec(line)
    if (match === null) return []
    const text = match[2]?.trim() ?? ''
    return text === '' ? [] : [{ text, done: match[1]?.toLowerCase() === 'x' }]
  })
}

/** One task header plus its description, acceptance, execution controls and recent audit slice. */
export function LoomTaskWorkbench({ t, task, project, version, snapshot, audit, actions, loadChanges, wrap, onToggleWrap }: {
  t: Translate
  task: TaskRecord
  project: ProjectRecord | undefined
  version: VersionRecord | undefined
  snapshot: CatalogSnapshot
  audit: readonly AuditEntry[]
  actions: ExecutionActions
  loadChanges: LoadWorkspaceChanges
  wrap: boolean
  onToggleWrap: () => void
}): ReactNode {
  const status = STATUS_META[task.status]
  const priority = PRIORITY_META[task.priority ?? 'normal']
  const modules = (task.moduleIds ?? []).map(moduleId => project?.config.modules.find(module => module.id === moduleId)?.path ?? moduleId)
  const items = acceptanceItems(task.description ?? '')
  const recent = audit.slice(0, 4)
  return <div style={shell}>
    <header style={head}>
      <div style={titleLine}>
        <h2 style={title}>{task.title}</h2>
        <span style={{ ...chip, color: status.color }}><span aria-hidden style={{ width: 5, height: 5, borderRadius: 999, background: status.color }} />{t(status.key)}</span>
        <span style={chip}>{t(priority.key)}</span>
        {version !== undefined && <span style={chip}>{version.name}</span>}
      </div>
    </header>
    <div style={page}>
      <div style={stack}>

      <section style={card} aria-label={t('workbench.description')}>
        <h3 style={sectionHeading}>{t('workbench.description')}</h3>
        {task.description?.trim() ? <p style={description}>{task.description}</p> : <p style={muted}>{t('workbench.noDescription')}</p>}
        <div style={fieldGrid}>
          <div style={field}><span style={fieldLabel}>{t('task.version')}</span><span style={fieldValue}>{version?.name ?? '—'}</span></div>
          <div style={field}><span style={fieldLabel}>{t('task.priority')}</span><span style={{ ...fieldValue, color: priority.color }}>{t(priority.key)}</span></div>
          <div style={field}><span style={fieldLabel}>{t('task.modules')}</span><span style={fieldValue}>{modules.length === 0 ? '—' : modules.join(', ')}</span></div>
        </div>
      </section>

      <section style={card} aria-label={t('workbench.acceptance')}>
        <h3 style={sectionHeading}>{t('workbench.acceptance')}</h3>
        {items.length === 0
          ? <p style={muted}>{t('workbench.noAcceptance')}</p>
          : <ul style={acceptanceList}>{items.map((item, index) => <li key={`${String(index)}-${item.text}`} style={acceptanceRow}>
            <span aria-hidden style={{ ...check, ...(item.done ? { borderColor: COLORS.green, background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent)' } : {}) }}>{item.done ? '✓' : ''}</span>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{item.text}</span>
          </li>)}</ul>}
      </section>

      <section style={card} aria-label={t('workbench.execution')}>
        <h3 style={sectionHeading}>{t('workbench.execution')} <span style={{ ...chip, height: 19, color: status.color }}>{t(status.key)}</span></h3>
        {task.attempts.at(-1)?.sessionIds.at(-1) !== undefined && <Button variant="primary" className="loom-primary" onClick={() => actions.onSession(task.attempts.at(-1)?.sessionIds.at(-1) as Parameters<ExecutionActions['onSession']>[0])} style={{ alignSelf: 'flex-start' }}>{t('session.open')}</Button>}
        <ExecutionPanel t={t} task={task} snapshot={snapshot} selectedSession={undefined} actions={actions} loadChanges={loadChanges} wrap={wrap} onToggleWrap={onToggleWrap} />
      </section>

      <section style={{ padding: '2px 2px 0' }} aria-label={t('workbench.activity')}>
        <h3 style={activityTitle}>{t('workbench.activity')}</h3>
        {recent.length === 0
          ? <p style={muted}>{t('workbench.noActivity')}</p>
          : <div style={activityList}>{recent.map(entry => <div key={entry.id} style={activityRow}>
            <span style={{ color: COLORS.faint, fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap' }}>{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
            <span style={{ minWidth: 0, display: 'flex', gap: 6, flexWrap: 'wrap', color: COLORS.dim }}>
              <span style={{ color: COLORS.text }}>{t(AUDIT_LABEL[entry.event])}</span>
              <span style={{ color: COLORS.faint }}>{t(ACTOR_LABEL[entry.actor])}</span>
              {entry.detail !== undefined && <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.detail}</span>}
            </span>
          </div>)}</div>}
      </section>
      </div>
    </div>
  </div>
}
