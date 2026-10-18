/** Collapsible bottom panel: native Diff, attempt activity and unwired integrations. */
import type { ReactNode } from 'react'
import type { AuditEntry } from 'dsh-loom/types'
import { LoomDiff, type LoadWorkspaceChanges, type RenderFileDiffSlot } from './LoomDiff.tsx'
import { ACTOR_LABEL, AUDIT_LABEL, COLORS, metaLine } from './shell.ts'
import type { TokenUsageView } from './projection.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

type Pane = 'diff' | 'terminal' | 'tests' | 'audit' | 'costs'

/** Bottom panel inputs; pane content never invents measurements. */
export interface LoomBottomPanelProps {
  readonly t: Translate
  readonly collapsed: boolean
  readonly pane: Pane
  readonly audit: readonly AuditEntry[]
  readonly diffCount: number
  readonly usage: TokenUsageView | undefined
  readonly workspaceId: string | undefined
  readonly loadChanges: LoadWorkspaceChanges
  readonly renderFactorySlot: RenderFileDiffSlot
  readonly onToggle: () => void
  readonly onPane: (pane: Pane) => void
}

const PANES: readonly { id: Pane; key: LoomKey }[] = [
  { id: 'diff', key: 'diff' },
  { id: 'terminal', key: 'terminal' },
  { id: 'tests', key: 'tests' },
  { id: 'audit', key: 'bottom.activity' },
  { id: 'costs', key: 'costs' },
]

/**
 * Render the collapsed tab bar and the selected pane.
 * @param props - current pane, task context and native Diff wiring.
 * @returns the bottom region of the Loom page.
 */
export function LoomBottomPanel(props: LoomBottomPanelProps): ReactNode {
  const { t, collapsed, pane, audit, diffCount, usage, workspaceId, loadChanges, renderFactorySlot, onToggle, onPane } = props
  return <section style={{ flex: 'none', borderTop: `0.5px solid ${COLORS.border}`, background: COLORS.panel, display: 'flex', flexDirection: 'column' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 8px', height: 34, overflowX: 'auto', borderBottom: collapsed ? 'none' : `0.5px solid ${COLORS.border}` }}>
      {PANES.map(item => <button key={item.id} type="button" onClick={() => { onPane(item.id); if (collapsed) onToggle() }} style={{ height: '100%', padding: '0 13px', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', borderBottom: `2px solid ${pane === item.id && !collapsed ? COLORS.accent : 'transparent'}`, color: pane === item.id && !collapsed ? COLORS.text : COLORS.dim, cursor: 'pointer', font: 'inherit', fontSize: 12 }}>{t(item.key)}{item.id === 'diff' && diffCount > 0 && <span style={{ background: COLORS.panel3, borderRadius: 7, padding: '0 5px', fontSize: 10, color: COLORS.dim }}>{String(diffCount)}</span>}{item.id === 'audit' && audit.length > 0 && <span style={{ background: COLORS.panel3, borderRadius: 7, padding: '0 5px', fontSize: 10, color: COLORS.dim }}>{String(audit.length)}</span>}</button>)}
      <button type="button" onClick={onToggle} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: COLORS.faint, cursor: 'pointer', font: 'inherit', fontSize: 11, padding: '0 10px' }}>{collapsed ? `▴ ${t('bottom.expand')}` : `▾ ${t('bottom.collapse')}`}</button>
    </div>
    {!collapsed && <div style={{ height: 170, overflow: 'auto', padding: '10px 16px', fontSize: 11.5, fontFamily: 'ui-monospace, "Cascadia Code", monospace', lineHeight: 1.75 }}>
      {pane === 'diff' && <LoomDiff t={t} workspaceId={workspaceId} loadChanges={loadChanges} renderFactorySlot={renderFactorySlot} />}
      {pane === 'audit' && (audit.length === 0
        ? <p style={{ ...metaLine, margin: 0 }}>{t('bottom.activityEmpty')}</p>
        : audit.map(entry => <div key={entry.id} style={{ display: 'flex', gap: 12, minWidth: 0 }}>
            <span style={{ color: COLORS.faint, whiteSpace: 'nowrap' }}>{new Date(entry.at).toLocaleTimeString([], { hour12: false })}</span>
            <span style={{ color: COLORS.cyan, whiteSpace: 'nowrap' }}>{t(AUDIT_LABEL[entry.event])}</span>
            <span style={{ color: COLORS.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.detail ?? entry.sessionId ?? entry.taskId ?? entry.workspaceId ?? '—'}</span>
            <span style={{ marginLeft: 'auto', color: COLORS.faint, whiteSpace: 'nowrap' }}>{t(ACTOR_LABEL[entry.actor])}</span>
          </div>))}
      {pane === 'costs' && (usage === undefined
        ? <p style={{ ...metaLine, margin: 0 }}>{t('ctx.notTracked')}</p>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>{t('ctx.usageInput')}: {String(usage.uncachedInputTokens)}</span>
            <span>{t('ctx.usageOutput')}: {String(usage.outputTokens)}</span>
            <span>{t('ctx.usageCached')}: {String(usage.cacheReadTokens + usage.cacheWriteTokens)}</span>
            <span>{t('ctx.usageTotal')}: {String(usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens)}</span>
            <span style={metaLine}>{t('ctx.usageNote')}</span>
          </div>)}
      {(pane === 'terminal' || pane === 'tests') && <p style={{ ...metaLine, margin: 0 }}>{t('bottom.wiredLater')} · {t('diff.workspace')}</p>}
    </div>}
  </section>
}

/** Pane id accepted by the bottom panel. */
export type LoomBottomPane = Pane
