/** Collapsible bottom panel: native Diff, attempt activity and unwired integrations. */
import type { ReactNode } from 'react'
import type { TaskRecord } from 'dsh-loom/types'
import { LoomDiff, type LoadWorkspaceChanges, type RenderFileDiffSlot } from './LoomDiff.tsx'
import { COLORS, metaLine, shortCommit } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

type Pane = 'diff' | 'terminal' | 'tests' | 'audit' | 'costs'

/** Bottom panel inputs; pane content never invents measurements. */
export interface LoomBottomPanelProps {
  readonly t: Translate
  readonly collapsed: boolean
  readonly pane: Pane
  readonly task: TaskRecord | undefined
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
  const { t, collapsed, pane, task, workspaceId, loadChanges, renderFactorySlot, onToggle, onPane } = props
  return <section style={{ flex: 'none', borderTop: `0.5px solid ${COLORS.border}`, background: COLORS.panel, display: 'flex', flexDirection: 'column' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 8px', height: 34, borderBottom: collapsed ? 'none' : `0.5px solid ${COLORS.border}` }}>
      {PANES.map(item => <button key={item.id} type="button" onClick={() => { onPane(item.id); if (collapsed) onToggle() }} style={{ height: '100%', padding: '0 13px', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', borderBottom: `2px solid ${pane === item.id && !collapsed ? COLORS.accent : 'transparent'}`, color: pane === item.id && !collapsed ? COLORS.text : COLORS.dim, cursor: 'pointer', font: 'inherit', fontSize: 12 }}>{t(item.key)}{item.id === 'audit' && task !== undefined && task.attempts.length > 0 && <span style={{ background: COLORS.panel3, borderRadius: 7, padding: '0 5px', fontSize: 10, color: COLORS.dim }}>{String(task.attempts.length)}</span>}</button>)}
      <button type="button" onClick={onToggle} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: COLORS.faint, cursor: 'pointer', font: 'inherit', fontSize: 11, padding: '0 10px' }}>{collapsed ? `▴ ${t('bottom.expand')}` : `▾ ${t('bottom.collapse')}`}</button>
    </div>
    {!collapsed && <div style={{ height: 170, overflow: 'auto', padding: '10px 16px', fontSize: 11.5, fontFamily: 'ui-monospace, "Cascadia Code", monospace', lineHeight: 1.75 }}>
      {pane === 'diff' && <LoomDiff t={t} workspaceId={workspaceId} loadChanges={loadChanges} renderFactorySlot={renderFactorySlot} />}
      {pane === 'audit' && (task === undefined || task.attempts.length === 0
        ? <p style={{ ...metaLine, margin: 0 }}>{t('bottom.activityEmpty')}</p>
        : task.attempts.map((attempt, index) => <div key={attempt.id} style={{ display: 'flex', gap: 12 }}>
            <span style={{ color: COLORS.faint }}>#{String(index + 1)}</span>
            <span style={{ color: COLORS.cyan }}>{shortCommit(attempt.lock) ?? '—'}</span>
            <span style={{ color: COLORS.dim }}>{attempt.sessionIds.length} {t('sessions')} · {attempt.status}</span>
          </div>))}
      {(pane === 'terminal' || pane === 'tests' || pane === 'costs') && <p style={{ ...metaLine, margin: 0 }}>{t('bottom.wiredLater')} · {t('diff.workspace')}</p>}
    </div>}
  </section>
}

/** Pane id accepted by the bottom panel. */
export type LoomBottomPane = Pane
