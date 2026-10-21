/** Pure task transitions; callers serialize persistence and workspace execution separately. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { WorkspaceMode, WorkspaceRepositoryBinding } from './workspace.ts'

/** Immutable repository baseline owned by a project version. */
export interface Lock {
  readonly id: Branded<'loom.lock'>
  readonly versionId: Branded<'loom.version'>
  readonly repositories: readonly { readonly sourceId: Branded<'loom.source'>; readonly commit: string }[]
}

/** Workspace identity and the baseline from which its mutable code began. */
export interface Workspace {
  readonly id: Branded<'loom.workspace'>
  readonly versionId: Lock['versionId']
  readonly lockId: Lock['id']
  /** Owning project; present on workspaces created after project-pool migration. */
  readonly projectId?: Branded<'loom.project'> | undefined
  readonly mode?: WorkspaceMode | undefined
  readonly rootPath?: string | undefined
  readonly rootOwner?: 'loom' | 'user' | undefined
  readonly repositories?: readonly WorkspaceRepositoryBinding[] | undefined
}

/** Task state, independent of native Session running and approval states. */
export type TaskStatus = 'pending' | 'running' | 'review' | 'completed' | 'failed'

/** One execution round preserves its original baseline across successive Sessions. */
export interface Attempt {
  readonly id: Branded<'loom.attempt'>
  readonly lock: Lock
  readonly workspaceId: Workspace['id']
  readonly sessionIds: readonly Branded<'SessionId'>[]
  readonly status: Exclude<TaskStatus, 'pending'>
}

/** Version-owned task with append-only round history. */
export interface Task {
  readonly id: Branded<'loom.task'>
  readonly versionId: Lock['versionId']
  readonly status: TaskStatus
  readonly attempts: readonly Attempt[]
}

/** Stable failure codes for caller-owned localization. */
export type TaskErrorCode = 'task_not_startable' | 'version_mismatch' | 'workspace_mismatch'
  | 'attempt_id_reused' | 'task_not_active' | 'human_confirmation_required' | 'invalid_transition'

/** Rejected domain operation, without persistence or filesystem effects. */
export class TaskError extends Error {
  constructor(readonly code: TaskErrorCode) {
    super(code)
    this.name = 'TaskError'
  }
}

/** Create an unstarted task without allocating a workspace.
 * @param id - Task identity.
 * @param versionId - Fixed owning version.
 * @returns a pending task.
 */
export function createTask(id: Task['id'], versionId: Task['versionId']): Task {
  return { id, versionId, status: 'pending', attempts: [] }
}

/** Start a new round; active rounds must be continued by attaching Sessions.
 * @param task - Current persisted task.
 * @param id - New round identity.
 * @param lock - Confirmed baseline for the owning version.
 * @param workspace - Prepared workspace with the matching original baseline.
 * @returns a new task snapshot, retaining prior rounds.
 */
export function startAttempt(task: Task, id: Attempt['id'], lock: Lock, workspace: Workspace): Task {
  if (task.status !== 'pending' && task.status !== 'failed') throw new TaskError('task_not_startable')
  if (lock.versionId !== task.versionId) throw new TaskError('version_mismatch')
  if (workspace.versionId !== task.versionId || workspace.lockId !== lock.id) throw new TaskError('workspace_mismatch')
  if (task.attempts.some(attempt => attempt.id === id)) throw new TaskError('attempt_id_reused')
  const baseline: Lock = Object.freeze({ ...lock, repositories: Object.freeze(lock.repositories.map(repo => Object.freeze({ ...repo }))) })
  const attempt: Attempt = { id, lock: baseline, workspaceId: workspace.id, sessionIds: [], status: 'running' }
  return { ...task, status: 'running', attempts: [...task.attempts, attempt] }
}

/** Link another Session to the same current round without allocating worktrees.
 * @param task - Active task.
 * @param sessionId - Native Session identity.
 * @returns a new snapshot, or the input for an existing association.
 */
export function attachSession(task: Task, sessionId: Attempt['sessionIds'][number]): Task {
  if (task.status !== 'running' && task.status !== 'review') throw new TaskError('task_not_active')
  const current = task.attempts.at(-1)
  if (!current) throw new TaskError('task_not_active')
  if (current.sessionIds.includes(sessionId)) return task
  return { ...task, attempts: [...task.attempts.slice(0, -1), { ...current, sessionIds: [...current.sessionIds, sessionId] }] }
}

/** Change business status without stopping Agents or releasing workspace execution rights.
 * @param task - Current task snapshot.
 * @param target - Requested business state.
 * @param actor - Trusted caller identity, never accepted directly from model arguments.
 * @returns a new task and current-round status snapshot.
 */
export function transitionTask(task: Task, target: TaskStatus, actor: 'human' | 'agent'): Task {
  if ((target === 'completed' || target === 'failed') && actor !== 'human') throw new TaskError('human_confirmation_required')
  const allowed = (task.status === 'running' && (target === 'review' || target === 'failed'))
    || (task.status === 'review' && (target === 'running' || target === 'completed' || target === 'failed'))
  if (!allowed) throw new TaskError('invalid_transition')
  const current = task.attempts.at(-1)
  if (!current) throw new TaskError('task_not_active')
  return { ...task, status: target, attempts: [...task.attempts.slice(0, -1), { ...current, status: target }] }
}
