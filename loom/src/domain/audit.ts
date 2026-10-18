/** Durable business audit entries for Loom-managed state changes. */

/** Stable audit event names; labels and presentation belong to callers. */
export type AuditEvent =
  | 'project.created'
  | 'project.updated'
  | 'version.created'
  | 'version.updated'
  | 'lock.generated'
  | 'task.created'
  | 'task.updated'
  | 'task.transitioned'
  | 'workspace.prepared'
  | 'workspace.cleaned'
  | 'attempt.started'
  | 'session.attached'
  | 'execution.acquired'
  | 'execution.queued'
  | 'execution.released'
  | 'execution.takeover-requested'
  | 'execution.takeover-stopped'
  | 'execution.takeover-blocked'

/** One committed business event; detail is a short human-readable summary. */
export interface AuditEntry {
  readonly id: string
  readonly at: number
  readonly actor: 'human' | 'agent' | 'system'
  readonly event: AuditEvent
  readonly taskId?: string | undefined
  readonly workspaceId?: string | undefined
  readonly sessionId?: string | undefined
  readonly detail?: string | undefined
}
