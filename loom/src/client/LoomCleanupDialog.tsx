/** Modal cleanup confirmation with native workspace Diff. */
import { useEffect, useState, type CSSProperties } from 'react'
import type { WorkspaceRecord } from 'dsh-loom/types'
import { LoomDiff, type LoadWorkspaceChanges, type RenderFileDiffSlot } from './LoomDiff.tsx'
import { failureKey } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

const backdrop: CSSProperties = { position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const panel: CSSProperties = { width: 900, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 48px)', overflow: 'auto', background: 'var(--dsw-alias-bg-layer-1)', border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 12, padding: 18, boxShadow: '0 24px 64px rgba(0,0,0,.5)' }
const button: CSSProperties = { color: 'inherit', background: 'transparent', border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', font: 'inherit' }
const alert: CSSProperties = { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: 1.6 }
const diffBox: CSSProperties = { marginTop: 12, border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 8, overflow: 'auto', maxHeight: 360, background: 'var(--dsw-alias-bg-layer-2)' }

/** Inputs for the cleanup confirmation modal. */
export interface LoomCleanupDialogProps {
  readonly t: Translate
  readonly workspace: WorkspaceRecord
  readonly busy: boolean
  readonly failure: string | undefined
  readonly discardAllowed: boolean
  readonly loadChanges: LoadWorkspaceChanges
  readonly renderFactorySlot: RenderFileDiffSlot
  readonly onConfirm: () => void
  readonly onDiscard: () => void
  readonly onCancel: () => void
}

/**
 * Confirm workspace cleanup and let the user inspect real working-tree changes first.
 * @param props - workspace, cleanup outcome and native Diff wiring.
 * @returns the modal, or null when no workspace is selected.
 */
export function LoomCleanupDialog({ t, workspace, busy, failure, discardAllowed, loadChanges, renderFactorySlot, onConfirm, onDiscard, onCancel }: LoomCleanupDialogProps) {
  const [showDiff, setShowDiff] = useState(false)
  const failureLabel = failure === undefined ? undefined : failureKey(failure)
  useEffect(() => {
    if (failure !== undefined && failureKey(failure) === 'error.workspaceChanges') setShowDiff(true)
  }, [failure])
  return <div style={backdrop} onClick={onCancel}>
    <div role="dialog" aria-modal="true" aria-label={t('workspace.cleanup')} style={panel} onClick={(event) => { event.stopPropagation() }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 15 }}>{t('workspace.cleanup')}</strong>
          <p style={{ ...alert, marginTop: 4, overflowWrap: 'anywhere', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{workspace.path}</p>
        </div>
        <button type="button" style={{ ...button, marginLeft: 'auto' }} onClick={onCancel}>{t('form.close')}</button>
      </div>
      <p style={alert}>{t('workspace.cleanupWarning')}</p>
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
      {showDiff && <div style={diffBox}><LoomDiff t={t} workspaceId={workspace.id} loadChanges={loadChanges} renderFactorySlot={renderFactorySlot} /></div>}
    </div>
  </div>
}
