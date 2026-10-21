/** Modal cleanup confirmation with native workspace Diff. */
import { useEffect, useState, type CSSProperties } from 'react'
import { IconFullscreenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceRecord } from 'dsh-workloom/types'
import { LoomDiff, type LoadWorkspaceChanges } from './LoomDiff.tsx'
import { failureKey } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

const backdrop: CSSProperties = { position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const panel: CSSProperties = { width: 880, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxSizing: 'border-box', background: 'var(--dsw-alias-bg-layer-1)', border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 12, padding: 18, boxShadow: '0 24px 64px rgba(0,0,0,.5)' }
const button: CSSProperties = { color: 'inherit', background: 'transparent', border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', font: 'inherit' }
const alert: CSSProperties = { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: 1.6 }
const diffBox: CSSProperties = { marginTop: 12, display: 'flex', flexDirection: 'column', minHeight: 0, border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 8, overflow: 'hidden', background: 'var(--dsw-alias-bg-layer-2)' }

/** Inputs for the cleanup confirmation modal. */
export interface LoomCleanupDialogProps {
  readonly t: Translate
  readonly workspace: WorkspaceRecord
  readonly busy: boolean
  readonly failure: string | undefined
  readonly discardAllowed: boolean
  readonly loadChanges: LoadWorkspaceChanges
  /** Whether comparisons wrap wide lines instead of scrolling sideways. */
  readonly wrap: boolean
  readonly onToggleWrap: () => void
  readonly onConfirm: () => void
  readonly onDiscard: () => void
  readonly onCancel: () => void
}

/**
 * Confirm workspace cleanup and let the user inspect real working-tree changes first.
 * @param props - workspace, cleanup outcome and native Diff wiring.
 * @returns the modal, or null when no workspace is selected.
 */
export function LoomCleanupDialog({ t, workspace, busy, failure, discardAllowed, loadChanges, wrap, onToggleWrap, onConfirm, onDiscard, onCancel }: LoomCleanupDialogProps) {
  const [showDiff, setShowDiff] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const failureLabel = failure === undefined ? undefined : failureKey(failure)
  useEffect(() => {
    if (failure !== undefined && failureKey(failure) === 'error.workspaceChanges') setShowDiff(true)
  }, [failure])
  return <div style={backdrop} onClick={onCancel}>
    <div role="dialog" aria-modal="true" aria-label={t('workspace.cleanup')} style={maximized ? { ...panel, width: 'calc(100vw - 24px)', height: 'calc(100vh - 24px)', maxHeight: 'none' } : panel} onClick={(event) => { event.stopPropagation() }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 15 }}>{t('workspace.cleanup')}</strong>
          <p style={{ ...alert, marginTop: 4, overflowWrap: 'anywhere', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{workspace.path}</p>
        </div>
        <button type="button" aria-pressed={maximized} style={{ ...button, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setMaximized(value => !value)}>
          <IconFullscreenOutlineRegular size={13} />{maximized ? t('workspace.cleanupRestore') : t('workspace.cleanupMaximize')}
        </button>
        <button type="button" style={button} onClick={onCancel}>{t('form.close')}</button>
      </div>
      <div style={{ minHeight: 0, overflowY: 'auto', flexShrink: 0 }}>
      <p style={alert}>{t(workspace.mode === 'direct' ? 'workspace.cleanupDirectWarning' : workspace.mode === 'linked' ? 'workspace.cleanupLinkedWarning' : 'workspace.cleanupWarning')}</p>
      {failure !== undefined && <p role="alert" style={{ ...alert, marginTop: 8 }}>{failureLabel === undefined ? t('state.error') : t(failureLabel)}{failureLabel === undefined ? `: ${failure}` : ''}</p>}
      {discardAllowed && <p role="alert" style={{ ...alert, marginTop: 8 }}>{t('workspace.cleanupDiscardHint')}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <button type="button" style={button} disabled={busy} onClick={() => setShowDiff(value => !value)}>{showDiff ? t('workspace.cleanupHideChanges') : t('workspace.cleanupViewChanges')}</button>
        <span style={{ flex: 1 }} />
        {discardAllowed
          ? <button type="button" style={button} disabled={busy} onClick={onDiscard}>{t('workspace.cleanupDiscard')}</button>
          : <button type="button" style={button} disabled={busy} onClick={onConfirm}>{t('workspace.cleanupConfirm')}</button>}
        <button type="button" style={button} disabled={busy} onClick={onCancel}>{t('form.cancel')}</button>
      </div>
      </div>
      {showDiff && <div style={{ ...diffBox, ...(maximized ? { flex: 1 } : { height: 420 }) }}><LoomDiff t={t} workspaceId={workspace.id} loadChanges={loadChanges} wrap={wrap} onToggleWrap={onToggleWrap} /></div>}
    </div>
  </div>
}
