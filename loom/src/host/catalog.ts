/** Persistent Loom catalog; one instance owns and serializes all mutations of its file. */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { brandNumber, brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { parseProject, type ProjectConfig } from '../domain/project.ts'
import { resolveLock } from '../domain/version.ts'
import { isAbsolute, normalize, resolve } from 'node:path'
import { workspaceBranchName } from '../domain/branch.ts'
import { createTask as pendingTask, startAttempt, attachSession, transitionTask, type Task, type Lock, type Workspace, type TaskStatus } from '../domain/task.ts'
import { createJsonStore, JsonStoreError } from '../storage/json-store.ts'
import { commitsSince, ensureWorktreeBranch, prepareWorkspace as materializeWorkspace, removeWorkspace, workingTreeChanges, WorkspacePreparationError, type WorkspaceRepositoryChanges } from '../git/workspace.ts'
import type { AuditEntry, AuditEvent } from '../domain/audit.ts'
import {
  confirmStop, createExecution, releaseExecution as releaseExecutionState, requestExecution,
  requestTakeover, type ExecutionOwner, type ExecutionState, type StopOutcome,
} from '../domain/execution.ts'

/** Project identity and admitted repository configuration. */
export interface ProjectRecord { id: Branded<'loom.project'>; config: ProjectConfig }
/** Named version with fixed project membership and repository refs. */
export interface VersionRecord { id: Branded<'loom.version'>; projectId: ProjectRecord['id']; name: string; sources: { sourceId: Branded<'loom.source'>; ref: string }[] }
/** Named task with its fixed version and execution history. */
export interface TaskRecord extends Task { title: string }
/** Already-prepared workspace metadata; a cleaned record keeps its history but no longer owns files. */
export interface WorkspaceRecord extends Workspace { path: string; branches?: Record<string, string> | undefined; managed?: boolean | undefined; cleaned?: boolean | undefined }
/** Detached durable catalog snapshot. */
export interface CatalogSnapshot { projects: ProjectRecord[]; versions: VersionRecord[]; locks: Lock[]; tasks: TaskRecord[]; workspaces: WorkspaceRecord[]; audit: AuditEntry[]; executions: ExecutionState[] }
/** Catalog operation rejection, suitable for caller-owned localization. */
export class CatalogError extends Error {
  constructor(readonly code: 'missing_project' | 'missing_version' | 'invalid_version' | 'invalid_catalog' | 'missing_lock' | 'missing_task' | 'missing_workspace' | 'workspace_mismatch' | 'workspace_path_registered' | 'invalid_workspace_path' | 'workspace_busy' | 'workspace_task_running' | 'workspace_branch_failed' | 'workspace_changes' | 'workspace_cleanup_failed' | 'workspace_cleaned' | 'workspace_unpushed') { super(code); this.name = 'CatalogError' }
}
const text = z.string().trim().min(1)
const id = <B extends string>() => text.transform(value => brandString<Branded<B>>(value))
const sourceSchema = z.strictObject({ sourceId: id<'loom.source'>(), ref: text })
const versionSchema = z.strictObject({ id: id<'loom.version'>(), projectId: id<'loom.project'>(), name: text, sources: z.array(sourceSchema).min(1) })
const lockSchema = z.strictObject({ id: id<'loom.lock'>(), versionId: id<'loom.version'>(), repositories: z.array(z.strictObject({ sourceId: id<'loom.source'>(), commit: z.string().regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u) })).min(1) })
const status = z.enum(['running', 'review', 'completed', 'failed'])
const taskSchema = z.strictObject({ id: id<'loom.task'>(), versionId: id<'loom.version'>(), title: text, status: z.enum(['pending', 'running', 'review', 'completed', 'failed']), attempts: z.array(z.strictObject({ id: id<'loom.attempt'>(), lock: lockSchema, workspaceId: id<'loom.workspace'>(), sessionIds: z.array(id<'SessionId'>()), status })) })
const workspaceSchema = z.strictObject({ id: id<'loom.workspace'>(), path: z.string().refine(value => isAbsolute(value) && normalize(value) === value), versionId: id<'loom.version'>(), lockId: id<'loom.lock'>(), branches: z.record(z.string(), text).optional(), managed: z.boolean().optional(), cleaned: z.boolean().optional() })
const auditEvents = ['project.created', 'version.created', 'lock.generated', 'task.created', 'task.transitioned', 'workspace.prepared', 'workspace.cleaned', 'attempt.started', 'session.attached', 'execution.acquired', 'execution.queued', 'execution.released', 'execution.takeover-requested', 'execution.takeover-stopped', 'execution.takeover-blocked'] as const
const auditSchema = z.strictObject({
  id: text,
  at: z.number().int().nonnegative(),
  actor: z.enum(['human', 'agent', 'system']),
  event: z.enum(auditEvents),
  taskId: id<'loom.task'>().optional(),
  workspaceId: id<'loom.workspace'>().optional(),
  sessionId: id<'SessionId'>().optional(),
  detail: z.string().optional(),
})
const generation = z.number().int().nonnegative().transform(value => brandNumber<ExecutionOwner['generation']>(value))
const ownerSchema = z.strictObject({ workspaceId: id<'loom.workspace'>(), sessionId: id<'SessionId'>(), generation })
const executionSchema = z.strictObject({
  workspaceId: id<'loom.workspace'>(),
  generation,
  owner: ownerSchema.nullable(),
  waiting: z.array(id<'SessionId'>()),
  takeover: z.strictObject({ sessionId: id<'SessionId'>(), stopStatus: z.enum(['requested', 'unknown', 'failed']) }).nullable(),
})
const schema = z.strictObject({
  projects: z.array(z.strictObject({ id: id<'loom.project'>(), config: z.unknown().transform(parseProject) })),
  versions: z.array(versionSchema), locks: z.array(lockSchema), tasks: z.array(taskSchema), workspaces: z.array(workspaceSchema),
  audit: z.array(auditSchema).max(500).optional().transform(value => value ?? []),
  executions: z.array(executionSchema).optional().transform(value => value ?? []),
})
function distinct(values: readonly string[]): boolean { return new Set(values).size === values.length }
function validVersion(project: ProjectRecord, version: Pick<VersionRecord, 'sources'>): boolean {
  return distinct(version.sources.map(s => s.sourceId)) && version.sources.every(s => project.config.sources.some(p => p.id === s.sourceId))
}
function parseCatalog(value: unknown): CatalogSnapshot {
  const data = schema.parse(value)
  const fail = () => { throw new CatalogError('invalid_catalog') }
  for (const rows of [data.projects, data.versions, data.locks, data.tasks, data.workspaces]) if (!distinct(rows.map(r => r.id))) fail()
  if (!distinct(data.workspaces.map(w => w.path))) fail()
  for (const version of data.versions) {
    const project = data.projects.find(p => p.id === version.projectId)
    if (!project || !validVersion(project, version)) fail()
  }
  for (const lock of data.locks) {
    const version = data.versions.find(v => v.id === lock.versionId)
    if (!version || !distinct(lock.repositories.map(r => r.sourceId)) || lock.repositories.length !== version.sources.length || lock.repositories.some(r => !version.sources.some(s => s.sourceId === r.sourceId))) fail()
  }
  const attempts: string[] = []
  for (const workspace of data.workspaces) {
    const version = data.versions.find(v => v.id === workspace.versionId)
    const lock = data.locks.find(l => l.id === workspace.lockId)
    if (!version || !lock || lock.versionId !== version.id) fail()
  }
  if (!distinct(data.executions.map(execution => execution.workspaceId))) fail()
  for (const execution of data.executions) {
    if (!data.workspaces.some(workspace => workspace.id === execution.workspaceId)) fail()
    if (execution.owner !== null && (execution.owner.workspaceId !== execution.workspaceId || Number(execution.owner.generation) > Number(execution.generation) || execution.owner.generation < 1)) fail()
    if (!distinct(execution.waiting)) fail()
    if (execution.owner !== null && execution.waiting.includes(execution.owner.sessionId)) fail()
    if (execution.takeover !== null && !execution.waiting.includes(execution.takeover.sessionId)) fail()
  }
  for (const task of data.tasks) {
    if (!data.versions.some(v => v.id === task.versionId)) fail()
    if (task.status === 'pending' ? task.attempts.length !== 0 : task.attempts.at(-1)?.status !== task.status) fail()
    for (const attempt of task.attempts) {
      attempts.push(attempt.id)
      const workspace = data.workspaces.find(w => w.id === attempt.workspaceId)
      if (!workspace || workspace.versionId !== task.versionId || workspace.lockId !== attempt.lock.id) fail()
      const lock = data.locks.find(l => l.id === attempt.lock.id)
      if (!lock || lock.versionId !== task.versionId || JSON.stringify(lock) !== JSON.stringify(attempt.lock) || !distinct(attempt.sessionIds)) fail()
    }
  }
  if (!distinct(attempts)) fail()
  return data
}
/** Persistent catalog operations. Writes are committed before snapshots change. */
export interface Catalog {
  snapshot(): CatalogSnapshot
  createProject(config: unknown): Promise<ProjectRecord>
  createVersion(projectId: ProjectRecord['id'], name: string, sources: readonly { sourceId: Branded<'loom.source'>; ref: string }[]): Promise<VersionRecord>
  generateLock(versionId: VersionRecord['id']): Promise<Lock>
  createTask(versionId: VersionRecord['id'], title: string): Promise<TaskRecord>
  prepareWorkspace(input: { path: string; versionId: Lock['versionId']; lockId: Lock['id'] }): Promise<WorkspaceRecord>
  workspaceChanges(workspaceId: WorkspaceRecord['id']): Promise<{ repositories: WorkspaceRepositoryChanges[] }>
  workspaceStatus(workspaceId: WorkspaceRecord['id']): Promise<{ running: boolean; repositories: WorkspaceRepositoryChanges[] }>
  cleanupWorkspace(workspaceId: WorkspaceRecord['id'], discardChanges: boolean): Promise<void>
  ensureWorkspaceBranches(workspaceId: WorkspaceRecord['id']): Promise<WorkspaceRecord>
  registerPreparedWorkspace(input: { path: string; versionId: Lock['versionId']; lockId: Lock['id'] }): Promise<WorkspaceRecord>
  startAttempt(taskId: TaskRecord['id'], workspaceId: WorkspaceRecord['id']): Promise<TaskRecord>
  attachSession(taskId: TaskRecord['id'], sessionId: Branded<'SessionId'>): Promise<TaskRecord>
  transitionTask(taskId: TaskRecord['id'], target: TaskStatus, actor: 'human' | 'agent'): Promise<TaskRecord>
  acquireExecution(workspaceId: WorkspaceRecord['id'], sessionId: Branded<'SessionId'>): Promise<ExecutionState>
  releaseExecution(workspaceId: WorkspaceRecord['id'], expected: ExecutionOwner): Promise<ExecutionState>
  beginTakeover(workspaceId: WorkspaceRecord['id'], sessionId: Branded<'SessionId'>): Promise<{ state: ExecutionState; owner: ExecutionOwner }>
  finishTakeover(workspaceId: WorkspaceRecord['id'], expected: ExecutionOwner, outcome: StopOutcome): Promise<ExecutionState>
  releaseSession(sessionId: Branded<'SessionId'>): Promise<void>
}
/** Open an existing catalog or initialize a missing one; corrupt data is never overwritten.
 * @param file - File in an existing parent directory, owned exclusively by this catalog instance.
 * @param resolveCommit - Local repository ref resolver; failures abort Lock generation.
 * @returns initialized catalog with instance-serialized transactions (not cross-process locking).
 */
export async function createCatalog(file: string, resolveCommit: (repo: string, ref: string) => Promise<string>): Promise<Catalog> {
  const store = createJsonStore<CatalogSnapshot>({ file, version: 1, parse: parseCatalog })
  let state: CatalogSnapshot
  try { state = await store.load() } catch (error) {
    if (!(error instanceof JsonStoreError) || error.code !== 'missing') throw error
    state = { projects: [], versions: [], locks: [], tasks: [], workspaces: [], audit: [], executions: [] }
    await store.write(state)
  }
  let queue: Promise<void> = Promise.resolve()
  function transaction<T>(operation: (draft: CatalogSnapshot) => Promise<T> | T): Promise<T> {
    const result = queue.then(async () => {
      const draft = structuredClone(state)
      const result = await operation(draft)
      await store.write(draft)
      state = draft
      return structuredClone(result)
    })
    queue = result.then(() => undefined, () => undefined)
    return result
  }
  function recordAudit(draft: CatalogSnapshot, event: AuditEvent, actor: AuditEntry['actor'], fields: Omit<AuditEntry, 'id' | 'at' | 'event' | 'actor'> = {}): void {
    draft.audit.push({ id: randomUUID(), at: Date.now(), actor, event, ...fields })
    if (draft.audit.length > 500) draft.audit.splice(0, draft.audit.length - 500)
  }
  function versionIn(draft: CatalogSnapshot, versionId: VersionRecord['id']): VersionRecord {
    const version = draft.versions.find(v => v.id === versionId)
    if (!version) throw new CatalogError('missing_version')
    return version
  }
  function taskIn(draft: CatalogSnapshot, taskId: TaskRecord['id']): TaskRecord {
    const task = draft.tasks.find(item => item.id === taskId)
    if (!task) throw new CatalogError('missing_task')
    return task
  }
  function workspaceWorktrees(draft: CatalogSnapshot, workspaceId: WorkspaceRecord['id']): { repo: string; directory: string; commit: string; branch?: string | undefined }[] {
    const workspace = workspaceIn(draft, workspaceId)
    const version = versionIn(draft, workspace.versionId)
    const project = draft.projects.find(item => item.id === version.projectId)
    if (!project) throw new CatalogError('missing_project')
    const lock = draft.locks.find(item => item.id === workspace.lockId)
    if (!lock) throw new CatalogError('missing_lock')
    return project.config.sources.map(source => {
      const pinned = lock.repositories.find(repository => repository.sourceId === source.id)
      if (pinned === undefined) throw new CatalogError('workspace_mismatch')
      return { repo: source.repo, directory: resolve(workspace.path, source.path), commit: pinned.commit, branch: workspace.branches?.[source.id] }
    })
  }
  function workspaceIn(draft: CatalogSnapshot, workspaceId: WorkspaceRecord['id']): WorkspaceRecord {
    const workspace = draft.workspaces.find(item => item.id === workspaceId)
    if (!workspace) throw new CatalogError('missing_workspace')
    return workspace
  }
  function executionIn(draft: CatalogSnapshot, workspaceId: WorkspaceRecord['id']): ExecutionState {
    workspaceIn(draft, workspaceId)
    return draft.executions.find(item => item.workspaceId === workspaceId) ?? createExecution(workspaceId)
  }
  function storeExecution(draft: CatalogSnapshot, execution: ExecutionState): void {
    const index = draft.executions.findIndex(item => item.workspaceId === execution.workspaceId)
    if (index === -1) draft.executions.push(execution)
    else draft.executions[index] = execution
  }

  return {
    prepareWorkspace: async input => transaction(async draft => {
      const version = versionIn(draft, input.versionId)
      const lock = draft.locks.find(item => item.id === input.lockId)
      if (!lock) throw new CatalogError('missing_lock')
      if (lock.versionId !== version.id) throw new CatalogError('workspace_mismatch')
      if (!isAbsolute(input.path) || normalize(input.path) !== input.path) throw new CatalogError('invalid_workspace_path')
      const project = draft.projects.find(item => item.id === version.projectId)
      if (!project) throw new CatalogError('missing_project')
      if (draft.workspaces.some(item => item.path === input.path)) throw new CatalogError('workspace_path_registered')
      const id = brandString<WorkspaceRecord['id']>(randomUUID())
      const branches = Object.fromEntries(project.config.sources.map(source => [source.id, workspaceBranchName(version.name, id, source.id)]))
      const repositories = project.config.sources.map(source => {
        const pinned = lock.repositories.find(repository => repository.sourceId === source.id)
        if (pinned === undefined) throw new CatalogError('workspace_mismatch')
        return { repo: source.repo, path: source.path, commit: pinned.commit, branch: branches[source.id]! }
      })
      await materializeWorkspace(input.path, repositories)
      const record = { id, path: input.path, versionId: version.id, lockId: lock.id, branches, managed: true }
      draft.workspaces.push(record)
      recordAudit(draft, 'workspace.prepared', 'human', { workspaceId: record.id, detail: input.path })
      return record
    }),
    ensureWorkspaceBranches: async workspaceId => {
      const workspace = workspaceIn(state, workspaceId)
      if (workspace.cleaned === true) return workspace
      if (state.executions.some(execution => execution.workspaceId === workspaceId && execution.owner !== null)) return workspace
      const version = versionIn(state, workspace.versionId)
      const project = state.projects.find(item => item.id === version.projectId)
      if (!project) throw new CatalogError('missing_project')
      if (project.config.sources.every(source => workspace.branches?.[source.id] !== undefined)) return workspace
      const branches = { ...workspace.branches }
      let changed = false
      for (const source of project.config.sources) {
        const directory = resolve(workspace.path, source.path)
        const base = branches[source.id] ?? workspaceBranchName(version.name, workspace.id, source.id)
        let branch = base
        let attached: string | undefined
        for (let attempt = 0; attempt < 3; attempt++) {
          try { attached = await ensureWorktreeBranch(directory, branch); break }
          catch (error) {
            if (!(error instanceof WorkspacePreparationError) || error.code !== 'branch_exists' || attempt === 2) throw new CatalogError('workspace_branch_failed')
            branch = `${base}-${randomUUID().slice(0, 4)}`
          }
        }
        if (attached === undefined) throw new CatalogError('workspace_branch_failed')
        if (branches[source.id] !== attached) { branches[source.id] = attached; changed = true }
      }
      if (!changed) return workspace
      return transaction(draft => {
        const index = draft.workspaces.findIndex(item => item.id === workspaceId)
        if (index === -1) throw new CatalogError('missing_workspace')
        draft.workspaces[index] = { ...draft.workspaces[index]!, branches }
        return draft.workspaces[index]!
      })
    },
    workspaceChanges: async workspaceId => ({ repositories: await workingTreeChanges(workspaceWorktrees(state, workspaceId)) }),
    workspaceStatus: async workspaceId => {
      const running = state.tasks.some(task => task.status === 'running' && task.attempts.some(attempt => attempt.workspaceId === workspaceId))
      return { running, repositories: await workingTreeChanges(workspaceWorktrees(state, workspaceId)) }
    },
    cleanupWorkspace: async (workspaceId, discardChanges) => {
      const worktrees = workspaceWorktrees(state, workspaceId)
      if (state.tasks.some(task => task.status === 'running' && task.attempts.some(attempt => attempt.workspaceId === workspaceId))) throw new CatalogError('workspace_busy')
      if (!discardChanges) {
        for (const worktree of worktrees) if (await commitsSince(worktree.directory, worktree.commit) > 0) throw new CatalogError('workspace_unpushed')
        const changes = await workingTreeChanges(worktrees)
        if (changes.some(repository => repository.files.length > 0)) throw new CatalogError('workspace_changes')
      }
      const record = state.workspaces.find(item => item.id === workspaceId)!
      const failures = await removeWorkspace(record.path, worktrees.map(({ repo, directory, branch }) => ({ repo, directory, ...(record.managed === true && branch !== undefined ? { branch } : {}) })))
      if (failures.length > 0) throw new CatalogError('workspace_cleanup_failed')
      const referenced = state.tasks.some(task => task.attempts.some(attempt => attempt.workspaceId === workspaceId))
      await transaction(draft => {
        const index = draft.workspaces.findIndex(item => item.id === workspaceId)
        if (referenced) draft.workspaces[index] = { ...draft.workspaces[index]!, cleaned: true }
        else draft.workspaces.splice(index, 1)
        draft.executions = draft.executions.filter(execution => execution.workspaceId !== workspaceId)
        recordAudit(draft, 'workspace.cleaned', 'human', { workspaceId, detail: record.path })
      })
    },
    registerPreparedWorkspace: async input => {
      const record = workspaceSchema.parse({ ...input, id: randomUUID() })
      return transaction(draft => {
        versionIn(draft, record.versionId)
        const lock = draft.locks.find(item => item.id === record.lockId)
        if (!lock) throw new CatalogError('missing_lock')
        if (lock.versionId !== record.versionId) throw new CatalogError('workspace_mismatch')
        if (draft.workspaces.some(item => item.path === record.path)) throw new CatalogError('workspace_path_registered')
        draft.workspaces.push(record)
        recordAudit(draft, 'workspace.prepared', 'system', { workspaceId: record.id, detail: record.path })
        return record
      })
    },
    startAttempt: (taskId, workspaceId) => transaction(draft => {
      const task = taskIn(draft, taskId)
      const workspace = workspaceIn(draft, workspaceId)
      if (workspace.cleaned === true) throw new CatalogError('workspace_cleaned')
      const otherRunning = draft.tasks.some(other => other.id !== taskId && other.status === 'running' && other.attempts.at(-1)?.workspaceId === workspaceId)
      const otherExecuting = draft.executions.some(execution => execution.workspaceId === workspaceId && execution.owner !== null)
      if (otherRunning || otherExecuting) throw new CatalogError('workspace_task_running')
      const lock = draft.locks.find(item => item.id === workspace.lockId)
      if (!lock) throw new CatalogError('missing_lock')
      const updated = { ...task, ...startAttempt(task, brandString<Branded<'loom.attempt'>>(randomUUID()), lock, workspace) }
      draft.tasks[draft.tasks.indexOf(task)] = updated
      recordAudit(draft, 'attempt.started', 'human', { taskId, workspaceId, detail: lock.id })
      return updated
    }),
    attachSession: (taskId, sessionId) => transaction(draft => {
      const task = taskIn(draft, taskId)
      const updated = { ...task, ...attachSession(task, sessionId) }
      draft.tasks[draft.tasks.indexOf(task)] = updated
      recordAudit(draft, 'session.attached', 'human', { taskId, sessionId, workspaceId: updated.attempts.at(-1)?.workspaceId })
      return updated
    }),
    transitionTask: (taskId, target, actor) => transaction(draft => {
      const task = taskIn(draft, taskId)
      const updated = { ...task, ...transitionTask(task, target, actor) }
      draft.tasks[draft.tasks.indexOf(task)] = updated
      recordAudit(draft, 'task.transitioned', actor, { taskId, detail: `${task.status}->${target}` })
      return updated
    }),
    acquireExecution: (workspaceId, sessionId) => {
      const existing = state.executions.find(execution => execution.workspaceId === workspaceId)
      if (existing !== undefined && (existing.owner?.sessionId === sessionId || existing.waiting.includes(sessionId))) {
        return Promise.resolve(structuredClone(existing))
      }
      return transaction(draft => {
        const previous = executionIn(draft, workspaceId)
        const next = requestExecution(previous, sessionId)
        storeExecution(draft, next)
        if (next.owner?.sessionId === sessionId) recordAudit(draft, 'execution.acquired', 'agent', { workspaceId, sessionId })
        else recordAudit(draft, 'execution.queued', 'agent', { workspaceId, sessionId })
        return next
      })
    },
    releaseExecution: (workspaceId, expected) => transaction(draft => {
      const next = releaseExecutionState(executionIn(draft, workspaceId), expected)
      storeExecution(draft, next)
      recordAudit(draft, 'execution.released', 'agent', { workspaceId, sessionId: expected.sessionId, detail: next.owner?.sessionId })
      return next
    }),
    beginTakeover: (workspaceId, sessionId) => transaction(draft => {
      const previous = executionIn(draft, workspaceId)
      if (!previous.owner) throw new CatalogError('workspace_busy')
      const owner = previous.owner
      const next = requestTakeover(previous, sessionId, owner)
      storeExecution(draft, next)
      recordAudit(draft, 'execution.takeover-requested', 'human', { workspaceId, sessionId, detail: owner.sessionId })
      return { state: next, owner }
    }),
    finishTakeover: (workspaceId, expected, outcome) => transaction(draft => {
      const next = confirmStop(executionIn(draft, workspaceId), expected, outcome)
      storeExecution(draft, next)
      recordAudit(draft, outcome === 'stopped' ? 'execution.takeover-stopped' : 'execution.takeover-blocked', 'system', { workspaceId, sessionId: next.owner?.sessionId, detail: outcome })
      return next
    }),
    releaseSession: sessionId => {
      if (!state.executions.some(execution => execution.owner?.sessionId === sessionId || execution.waiting.includes(sessionId))) return Promise.resolve()
      return transaction(draft => {
        for (const previous of [...draft.executions]) {
          if (previous.owner?.sessionId !== sessionId && !previous.waiting.includes(sessionId)) continue
          const next = previous.owner?.sessionId === sessionId
            ? previous.takeover ? confirmStop(previous, previous.owner, 'stopped') : releaseExecutionState(previous, previous.owner)
            : { ...previous, waiting: previous.waiting.filter(waiter => waiter !== sessionId) }
          if (next === previous) continue
          storeExecution(draft, next)
          recordAudit(draft, 'execution.released', 'system', { workspaceId: previous.workspaceId, sessionId, detail: next.owner?.sessionId })
        }
      })
    },
    snapshot: () => structuredClone(state),
    createProject: async input => {
      const config = parseProject(input)
      return transaction(draft => {
        const record = { id: brandString<ProjectRecord['id']>(randomUUID()), config }
        draft.projects.push(record)
        recordAudit(draft, 'project.created', 'human', { detail: config.name })
        return record
      })
    },
    createVersion: async (projectId, name, sources) => {
      const record = versionSchema.parse({ id: randomUUID(), projectId, name, sources })
      return transaction(draft => {
        const project = draft.projects.find(p => p.id === projectId)
        if (!project) throw new CatalogError('missing_project')
        if (!validVersion(project, record)) throw new CatalogError('invalid_version')
        draft.versions.push(record)
        recordAudit(draft, 'version.created', 'human', { detail: record.name })
        return record
      })
    },
    generateLock: versionId => transaction(async draft => {
      const version = versionIn(draft, versionId)
      const project = draft.projects.find(p => p.id === version.projectId)!
      const lock = await resolveLock(project.config, version, randomUUID(), resolveCommit)
      draft.locks.push(lock)
      recordAudit(draft, 'lock.generated', 'human', { detail: lock.repositories.map(repository => repository.commit.slice(0, 8)).join(' ') })
      return lock
    }),
    createTask: async (versionId, title) => {
      const admittedTitle = text.parse(title)
      return transaction(draft => {
        versionIn(draft, versionId)
        const record = { ...pendingTask(brandString<Task['id']>(randomUUID()), versionId), title: admittedTitle }
        draft.tasks.push(record)
        recordAudit(draft, 'task.created', 'human', { taskId: record.id, detail: admittedTitle })
        return record
      })
    },
  }
}
