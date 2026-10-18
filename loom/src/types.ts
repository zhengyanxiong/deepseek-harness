/**
 * Public Loom wire types: the JSON values exchanged with the Host catalog and
 * the request bodies accepted by its Remote endpoints.
 */
export type * from './domain/project.ts'
export type * from './domain/task.ts'
export type * from './domain/version.ts'
export type * from './domain/execution.ts'
export type * from './host/catalog.ts'

/** Admit one project configuration. */
export interface CreateVersionRequest {
  readonly projectId: string
  readonly name: string
  readonly sources: readonly { readonly sourceId: string; readonly ref: string }[]
}
/** Create one task under a version. */
export interface CreateTaskRequest {
  readonly versionId: string
  readonly title: string
}
/** Resolve every repository ref of one version. */
export interface GenerateLockRequest {
  readonly versionId: string
}
/** Record one prepared workspace. */
export interface RegisterWorkspaceRequest {
  readonly path: string
  readonly versionId: string
  readonly lockId: string
}
/** Start the next execution round of one task. */
export interface StartAttemptRequest {
  readonly taskId: string
  readonly workspaceId: string
}
/** Associate a native Session with one task round. */
export interface AttachSessionRequest {
  readonly taskId: string
  readonly sessionId: string
}
/** Change one task's business status. */
export interface TransitionTaskRequest {
  readonly taskId: string
  readonly target: 'pending' | 'running' | 'review' | 'completed' | 'failed'
  readonly actor: 'human' | 'agent'
}
