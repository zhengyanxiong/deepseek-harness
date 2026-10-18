/** Shared visual tokens and small projections for the Loom shell. */
import type { CSSProperties } from 'react'
import type { AuditEvent, Lock, TaskPriority } from 'dsh-workloom/types'
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

/** Whether a human may move a card between business states without starting a new round. */
export function canMoveTask(from: TaskStatus, to: TaskStatus): boolean {
  return (from === 'running' && (to === 'review' || to === 'failed'))
    || (from === 'review' && (to === 'running' || to === 'completed' || to === 'failed'))
}

/** Task priority presentation; priority never changes execution rights. */
export const PRIORITY_META: Readonly<Record<TaskPriority, { readonly key: LoomKey; readonly color: string }>> = {
  low: { key: 'task.priority.low', color: COLORS.faint },
  normal: { key: 'task.priority.normal', color: COLORS.cyan },
  high: { key: 'task.priority.high', color: COLORS.warn },
}

/** Locale keys for audited business events. */
export const AUDIT_LABEL: Readonly<Record<AuditEvent, LoomKey>> = {
  'project.created': 'audit.project.created',
  'project.updated': 'audit.project.updated',
  'project.deleted': 'audit.project.deleted',
  'version.created': 'audit.version.created',
  'version.updated': 'audit.version.updated',
  'version.deleted': 'audit.version.deleted',
  'lock.generated': 'audit.lock.generated',
  'task.created': 'audit.task.created',
  'task.updated': 'audit.task.updated',
  'task.deleted': 'audit.task.deleted',
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

/** Locale keys for durable audit actors. */
export const ACTOR_LABEL = { human: 'actor.human', agent: 'actor.agent', system: 'actor.system' } as const

/** Locale keys for workspace and catalog failures surfaced in execution forms. */
export const ERROR_LABEL: Readonly<Record<string, LoomKey>> = {
  existing_root: 'error.existingRoot',
  invalid_path: 'error.invalidPath',
  invalid_form: 'error.invalidForm',
  workspace_path_registered: 'error.pathRegistered',
  local_repository_required: 'error.repositoryRequired',
  invalid_repository: 'error.invalidRepository',
  dubious_ownership: 'error.dubiousOwnership',
  git_not_found: 'error.gitNotFound',
  invalid_commit: 'error.invalidCommit',
  invalid_ref: 'error.invalidRef',
  missing_lock: 'error.lockMissing',
  workspace_busy: 'error.workspaceBusy',
  workspace_task_running: 'error.workspaceTaskRunning',
  workspace_branch_failed: 'error.workspaceBranchFailed',
  workspace_changes: 'error.workspaceChanges',
  workspace_unpushed: 'error.workspaceUnpushed',
  workspace_mismatch: 'error.workspaceMismatch',
  invalid_task: 'error.invalidTask',
  invalid_version: 'error.invalidVersion',
  project_has_versions: 'error.projectHasVersions',
  version_has_tasks: 'error.versionHasTasks',
  version_has_workspaces: 'error.versionHasWorkspaces',
  task_busy: 'error.taskBusy',
  task_workspace_uncleaned: 'error.taskWorkspaceUncleaned',
}

/**
 * Resolve a remote failure message to its localized explanation.
 * @param failure - Host error code, possibly suffixed with rollback detail.
 * @returns the locale key, or undefined for an unmapped failure.
 */
export function failureKey(failure: string): LoomKey | undefined {
  const code = /^([a-z][a-z0-9_]*)/u.exec(failure)?.[1]
  return code === undefined ? undefined : ERROR_LABEL[code]
}

/** Localized failure line plus optional diagnostic detail. */
export interface FailureReport {
  readonly message: LoomKey
  readonly detail?: string
}

const DELETE_REMOTE = /loom[./]delete(?:Project|Version|Task)/iu
const UNAVAILABLE = /is not a function|is not mounted|no longer mounted|is unavailable|not loaded|definition-unavailable|method-unavailable/iu

function missingDeleteRemote(code: string, message: string): boolean {
  return (code === 'gateway/definition-unavailable' || code === 'gateway/method-unavailable')
    || (DELETE_REMOTE.test(message) && UNAVAILABLE.test(message))
}

/**
 * Resolve one wire failure to localized copy without discarding its diagnostic.
 * Codes win over messages, so an owner-declared `loom/<catalog code>` stays stable
 * when the Host adds context to the message.
 * @param code - stable wire failure code.
 * @param message - Host diagnostic carried beside the code.
 * @returns the localized failure line and, for unknown failures, the diagnostic.
 */
export function failureReport(code: string, message: string): FailureReport {
  const direct = ERROR_LABEL[code]
  const local = code.slice(code.lastIndexOf('/') + 1)
  const key = direct ?? ERROR_LABEL[local] ?? failureKey(message)
  if (key !== undefined) return { message: key }
  if (missingDeleteRemote(code, message)) return { message: 'error.hostNotLoaded' }
  return { message: 'delete.unknownFailure', ...(message === '' ? {} : { detail: `${code}: ${message}` }) }
}

/**
 * Report a thrown call failure, including a local method that the running Host never mounted.
 * @param error - caught value.
 * @returns localized copy and the original message when no specific reason is known.
 */
export function thrownFailureReport(error: unknown): FailureReport {
  const message = error instanceof Error ? error.message : String(error)
  if (missingDeleteRemote('', message)) return { message: 'error.hostNotLoaded' }
  return { message: 'delete.unknownFailure', ...(message === '' ? {} : { detail: message }) }
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
