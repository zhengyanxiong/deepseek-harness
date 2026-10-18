/** Shared visual tokens and small projections for the Loom shell. */
import type { CSSProperties } from 'react'
import type { AuditEvent, Lock } from 'dsh-loom/types'
import type { TaskStatus } from '../domain/task.ts'
import type { LoomKey } from './locales.ts'

/** Theme aliases shared by every Loom shell region. */
export const COLORS = {
  bg: 'var(--dsw-alias-bg-base)',
  panel: 'var(--dsw-alias-bg-layer-1)',
  panel2: 'var(--dsw-alias-bg-layer-2)',
  panel3: 'var(--dsw-alias-bg-layer-3)',
  border: 'var(--dsw-alias-border-l4)',
  borderStrong: 'var(--dsw-alias-border-l3)',
  text: 'var(--dsw-alias-label-primary)',
  dim: 'var(--dsw-alias-label-secondary)',
  faint: 'var(--dsw-alias-label-caption)',
  accent: 'var(--dsw-alias-brand-primary)',
  green: 'var(--dsw-alias-state-success-primary)',
  warn: 'var(--dsw-alias-state-warn-primary)',
  error: 'var(--dsw-alias-label-error)',
  cyan: '#39c5cf',
  purple: '#ab7df8',
} as const

/** Business-state presentation shared by the board, cards and header. */
export const STATUS_META: Readonly<Record<TaskStatus, { readonly key: LoomKey; readonly color: string }>> = {
  pending: { key: 'task.status.pending', color: COLORS.faint },
  running: { key: 'task.status.running', color: COLORS.accent },
  review: { key: 'task.status.review', color: COLORS.purple },
  completed: { key: 'task.status.completed', color: COLORS.green },
  failed: { key: 'task.status.failed', color: COLORS.error },
}

/** Status order shown by the board and tree. */
export const STATUS_ORDER: readonly TaskStatus[] = ['pending', 'running', 'review', 'completed', 'failed']

/** Locale keys for audited business events. */
export const AUDIT_LABEL: Readonly<Record<AuditEvent, LoomKey>> = {
  'project.created': 'audit.project.created',
  'version.created': 'audit.version.created',
  'lock.generated': 'audit.lock.generated',
  'task.created': 'audit.task.created',
  'task.transitioned': 'audit.task.transitioned',
  'workspace.prepared': 'audit.workspace.prepared',
  'workspace.cleaned': 'audit.workspace.cleaned',
  'attempt.started': 'audit.attempt.started',
  'session.attached': 'audit.session.attached',
  'execution.acquired': 'audit.execution.acquired',
  'execution.queued': 'audit.execution.queued',
  'execution.released': 'audit.execution.released',
  'execution.takeover-requested': 'audit.execution.takeover-requested',
  'execution.takeover-stopped': 'audit.execution.takeover-stopped',
  'execution.takeover-blocked': 'audit.execution.takeover-blocked',
}

/** Locale keys for workspace and catalog failures surfaced in execution forms. */
export const ERROR_LABEL: Readonly<Record<string, LoomKey>> = {
  existing_root: 'error.existingRoot',
  invalid_path: 'error.invalidPath',
  workspace_path_registered: 'error.pathRegistered',
  local_repository_required: 'error.repositoryRequired',
  invalid_repository: 'error.invalidRepository',
  invalid_commit: 'error.invalidCommit',
  invalid_ref: 'error.invalidRef',
  missing_lock: 'error.lockMissing',
  workspace_busy: 'error.workspaceBusy',
  workspace_changes: 'error.workspaceChanges',
  workspace_unpushed: 'error.workspaceUnpushed',
  workspace_mismatch: 'error.workspaceMismatch',
}

/**
 * Resolve a remote failure message to its localized explanation.
 * @param failure - Host error code, possibly suffixed with rollback detail.
 * @returns the locale key, or undefined for an unmapped failure.
 */
export function failureKey(failure: string): LoomKey | undefined {
  return ERROR_LABEL[failure.split(';')[0]!.trim()]
}

export const pill: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, border: `0.5px solid ${COLORS.border}`, borderRadius: 999, padding: '1px 8px', fontSize: 11, color: COLORS.dim, whiteSpace: 'nowrap' }
export const button: CSSProperties = { color: 'inherit', background: 'transparent', border: `0.5px solid ${COLORS.border}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', font: 'inherit' }
export const select: CSSProperties = { ...button, background: COLORS.panel2, cursor: 'pointer' }
export const sectionTitle: CSSProperties = { margin: '0 0 8px', fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: COLORS.faint, textTransform: 'uppercase' as const }
export const metaLine: CSSProperties = { color: COLORS.faint, fontSize: 11 }

/** Short commit label for chips and context rows. */
export function shortCommit(lock: Lock | undefined): string | undefined {
  return lock?.repositories[0]?.commit.slice(0, 7)
}

/** Render a task count with the localized unit.
 * @param count - number of cards.
 * @param t - locale lookup.
 * @returns label such as `3 卡片`.
 */
export function cardCount(count: number, t: (key: LoomKey) => string): string {
  return `${String(count)} ${t('kb.cardsUnit')}`
}
