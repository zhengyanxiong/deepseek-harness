/** Modal confirmation for stopping the current workspace owner and taking execution over. */
import { Button, IconWarningTriangleOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { COLORS } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

const dangerAction = { color: COLORS.error, borderColor: COLORS.error } as const
const body = { display: 'flex', alignItems: 'flex-start', gap: 10 } as const
const warning = { margin: 0, color: COLORS.dim, fontSize: 12, lineHeight: 1.65 } as const
const alert = { margin: '12px 0 0', color: COLORS.error, fontSize: 12, lineHeight: 1.6 } as const

/** Inputs for the execution takeover confirmation modal. */
export interface LoomTakeoverDialogProps {
  readonly t: Translate
  readonly open: boolean
  readonly busy: boolean
  readonly failed: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

/**
 * Confirm stopping the current Agent turn before acquiring its workspace.
 * @param props - visibility, progress and the confirmed-stop command.
 * @returns the modal while takeover confirmation is open.
 */
export function LoomTakeoverDialog({ t, open, busy, failed, onCancel, onConfirm }: LoomTakeoverDialogProps) {
  return <Modal
    open={open}
    title={t('execution.takeover')}
    closeLabel={t('form.close')}
    onClose={() => { if (!busy) onCancel() }}
    footer={<>
      <Button variant="ghost" disabled={busy} data-modal-autofocus onClick={onCancel}>{t('form.cancel')}</Button>
      <Button variant="outline" disabled={busy} style={dangerAction} onClick={onConfirm}>{busy ? t('execution.stopping') : t('form.confirm')}</Button>
    </>}
  >
    <div style={body}>
      <span style={{ flex: 'none', marginTop: 1, color: COLORS.error }}><IconWarningTriangleOutlineRegular size={16} /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={warning}>{t('execution.takeoverWarning')}</p>
        {failed && <p role="alert" style={alert}>{t('state.error')}</p>}
      </div>
    </div>
  </Modal>
}
