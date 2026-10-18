/** Modal confirmation for deleting one project, version or task. */
import { Button, IconWarningTriangleOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { COLORS, type FailureReport } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** Catalog object whose deletion is being confirmed. */
export type DeleteKind = 'project' | 'version' | 'task'

/** Localized action label and dependency warning for each deletion kind. */
export const DELETE_COPY: Readonly<Record<DeleteKind, { readonly label: LoomKey; readonly warning: LoomKey }>> = {
  project: { label: 'project.delete', warning: 'delete.projectWarning' },
  version: { label: 'version.delete', warning: 'delete.versionWarning' },
  task: { label: 'task.delete', warning: 'delete.taskWarning' },
}

const dangerAction = { color: COLORS.error, borderColor: COLORS.error } as const
const body = { display: 'flex', alignItems: 'flex-start', gap: 10 } as const
const subjectLine = { margin: 0, color: COLORS.text, fontSize: 14, lineHeight: 1.5, fontWeight: 500, overflowWrap: 'anywhere' } as const
const warning = { margin: '8px 0 0', color: COLORS.dim, fontSize: 12, lineHeight: 1.65 } as const
const alertBox = { marginTop: 12, padding: '9px 10px', border: `0.5px solid ${COLORS.error}`, borderRadius: 'var(--dsw-radius-sm)', background: 'var(--dsw-alias-interactive-bg-hover-danger)' } as const
const failureText = { margin: 0, color: COLORS.error, fontSize: 12, lineHeight: 1.6 } as const
const failureDetail = { display: 'block', marginTop: 6, color: COLORS.dim, fontSize: 11, lineHeight: 1.5, fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } as const

/** Inputs for the deletion confirmation modal. */
export interface LoomDeleteDialogProps {
  readonly t: Translate
  readonly kind: DeleteKind
  readonly subject: string | undefined
  readonly busy: boolean
  readonly failure: FailureReport | undefined
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

/**
 * Confirm one destructive catalog action and keep its concrete failure visible.
 * @param props - object kind, subject, request progress and localized helpers.
 * @returns the modal while a deletion is pending.
 */
export function LoomDeleteDialog({ t, kind, subject, busy, failure, onCancel, onConfirm }: LoomDeleteDialogProps) {
  return <Modal
    open
    title={t(DELETE_COPY[kind].label)}
    closeLabel={t('form.close')}
    onClose={() => { if (!busy) onCancel() }}
    footer={<>
      <Button variant="ghost" disabled={busy} data-modal-autofocus onClick={onCancel}>{t('form.cancel')}</Button>
      <Button variant="outline" disabled={busy} style={dangerAction} onClick={onConfirm}>{busy ? t('delete.deleting') : t('delete.confirmAction')}</Button>
    </>}
  >
    <div style={body}>
      <span style={{ flex: 'none', marginTop: 1, color: COLORS.error }}><IconWarningTriangleOutlineRegular size={16} /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={subjectLine}>{subject ?? '—'}</p>
        <p style={warning}>{t(DELETE_COPY[kind].warning)}</p>
        {failure !== undefined && <div role="alert" style={alertBox}>
          <p style={failureText}>{t(failure.message)}</p>
          {failure.detail !== undefined && <code style={failureDetail}>{failure.detail}</code>}
        </div>}
      </div>
    </div>
  </Modal>
}
