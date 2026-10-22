/** Collapsible bottom panel: native Diff, attempt activity and unwired integrations. */
import { useEffect, useState, type ReactNode } from 'react'
import { IconFullscreenOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AuditEntry } from 'dsh-workloom/types'
import { LoomDiff, type LoadWorkspaceChanges } from './LoomDiff.tsx'
import { ACTOR_LABEL, AUDIT_LABEL, COLORS, metaLine } from './shell.ts'
import type { TokenUsageView } from './projection.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

type Pane = 'diff' | 'terminal' | 'tests' | 'audit' | 'costs'

/** Bottom panel inputs; pane content never invents measurements. */
export interface LoomBottomPanelProps {
  readonly t: Translate
  readonly collapsed: boolean
  /** Expanded pane body height in pixels. */
  readonly height: number
  readonly pane: Pane
  readonly audit: readonly AuditEntry[]
  readonly diffCount: number
  readonly usage: TokenUsageView | undefined
  readonly workspaceId: string | undefined
  /** Attempt whose start HEAD is the comparison baseline. */
  readonly attemptId?: string | undefined
  readonly loadChanges: LoadWorkspaceChanges
  /** Reports the changed-file count only when the Diff pane reads its changes. */
  readonly onChangesCount?: (count: number) => void
  /** Whether comparisons wrap wide lines instead of scrolling sideways. */
  readonly wrap: boolean
  readonly onToggleWrap: () => void
  readonly onOpenInRight?: (path: string) => void
  readonly onToggle: () => void
  readonly onPane: (pane: Pane) => void
}

/** Read-only count capsule for a bottom tab; hides itself at zero. */
function CountBadge({ count }: { count: number }): ReactNode {
  return count > 0 ? <Tag tone="info">{String(count)}</Tag> : null
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
  const { t, collapsed, height, pane, audit, diffCount, usage, workspaceId, attemptId, loadChanges, onChangesCount, wrap, onToggleWrap, onOpenInRight, onToggle, onPane } = props
  const [diffFullscreen, setDiffFullscreen] = useState(false)
  useEffect(() => { if (pane !== 'diff') setDiffFullscreen(false) }, [pane])
  useEffect(() => {
    if (!diffFullscreen) return
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setDiffFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [diffFullscreen])
  const diffBody = <LoomDiff t={t} workspaceId={workspaceId} {...(attemptId === undefined ? {} : { attemptId })} loadChanges={loadChanges} wrap={wrap} onToggleWrap={onToggleWrap} {...onOpenInRight === undefined ? {} : { onOpenInRight }} {...onChangesCount === undefined ? {} : { onChangesCount }} />
  return <section style={{ flex: 'none', borderTop: `0.5px solid ${COLORS.border}`, background: COLORS.panel2, display: 'flex', flexDirection: 'column' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 8px', height: 34, overflowX: 'auto', borderBottom: collapsed ? 'none' : `0.5px solid ${COLORS.border}` }}>
      {PANES.map(item => <button key={item.id} type="button" onClick={() => { onPane(item.id); if (collapsed) onToggle() }} style={{ height: '100%', flex: 'none', padding: '0 13px', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', background: 'none', border: 'none', borderBottom: `2px solid ${pane === item.id && !collapsed ? COLORS.accent : 'transparent'}`, color: pane === item.id && !collapsed ? COLORS.text : COLORS.dim, cursor: 'pointer', font: 'inherit', fontSize: 12 }}>{t(item.key)}{item.id === 'diff' ? <CountBadge count={diffCount} /> : item.id === 'audit' ? <CountBadge count={audit.length} /> : null}</button>)}
      {!collapsed && pane === 'diff' && <button type="button" title={t('diff.fullscreen')} aria-label={t('diff.fullscreen')} onClick={() => setDiffFullscreen(true)} style={{ marginLeft: 'auto', flex: 'none', display: 'flex', alignItems: 'center', gap: 5, height: '100%', padding: '0 10px', whiteSpace: 'nowrap', border: 'none', background: 'transparent', color: COLORS.faint, cursor: 'pointer', font: 'inherit', fontSize: 11 }}><IconFullscreenOutlineRegular size={13} />{t('diff.fullscreen')}</button>}
      <button type="button" onClick={onToggle} style={{ marginLeft: !collapsed && pane === 'diff' ? 0 : 'auto', flex: 'none', position: 'sticky', right: 0, zIndex: 1, background: COLORS.panel2, border: 'none', color: COLORS.faint, cursor: 'pointer', font: 'inherit', fontSize: 11, padding: '0 10px', whiteSpace: 'nowrap' }}>{collapsed ? `▴ ${t('bottom.expand')}` : `▾ ${t('bottom.collapse')}`}</button>
    </div>
    {!collapsed && <div style={{ height, overflow: 'auto', padding: '10px 16px', fontSize: 11.5, fontFamily: 'ui-monospace, "Cascadia Code", monospace', lineHeight: 1.75 }}>
      {pane === 'diff' && diffBody}
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
    {diffFullscreen && pane === 'diff' && <section aria-label={t('diff.title')} style={{ position: 'fixed', inset: 0, zIndex: 90, background: COLORS.panel, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `0.5px solid ${COLORS.border}`, flex: 'none' }}>
        <strong style={{ fontSize: 13 }}>{t('diff.title')}</strong>
        <span style={{ ...metaLine, marginLeft: 'auto' }}>{t('diff.files')}</span>
        <button type="button" title={t('diff.exitFullscreen')} aria-label={t('diff.exitFullscreen')} onClick={() => setDiffFullscreen(false)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `0.5px solid ${COLORS.border}`, borderRadius: 6, background: 'transparent', color: COLORS.text, cursor: 'pointer', font: 'inherit', fontSize: 11, padding: '4px 8px' }}><IconFullscreenOutlineRegular size={13} />{t('diff.exitFullscreen')}</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{diffBody}</div>
    </section>}
  </section>
}

/** Pane id accepted by the bottom panel. */
export type LoomBottomPane = Pane
