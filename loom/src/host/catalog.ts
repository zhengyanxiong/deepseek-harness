/** Persistent Loom catalog; one instance owns and serializes all mutations of its file. */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { parseProject, type ProjectConfig } from '../domain/project.ts'
import { resolveLock } from '../domain/version.ts'
import { isAbsolute, normalize, resolve } from 'node:path'
import { createTask as pendingTask, startAttempt, attachSession, transitionTask, type Task, type Lock, type Workspace, type TaskStatus } from '../domain/task.ts'
import { createJsonStore, JsonStoreError } from '../storage/json-store.ts'
import { prepareWorkspace as materializeWorkspace, workingTreeChanges } from '../git/workspace.ts'

/** Project identity and admitted repository configuration. */
export interface ProjectRecord { id: Branded<'loom.project'>; config: ProjectConfig }
/** Named version with fixed project membership and repository refs. */
export interface VersionRecord { id: Branded<'loom.version'>; projectId: ProjectRecord['id']; name: string; sources: { sourceId: Branded<'loom.source'>; ref: string }[] }
/** Named task with its fixed version and execution history. */
export interface TaskRecord extends Task { title: string }
/** Already-prepared workspace metadata; the orchestrator verifies actual files before admission. */
export interface WorkspaceRecord extends Workspace { path: string }
/** Detached durable catalog snapshot. */
export interface CatalogSnapshot { projects: ProjectRecord[]; versions: VersionRecord[]; locks: Lock[]; tasks: TaskRecord[]; workspaces: WorkspaceRecord[] }
/** Catalog operation rejection, suitable for caller-owned localization. */
export class CatalogError extends Error {
  constructor(readonly code: 'missing_project' | 'missing_version' | 'invalid_version' | 'invalid_catalog' | 'missing_lock' | 'missing_task' | 'missing_workspace' | 'workspace_mismatch' | 'workspace_path_registered' | 'invalid_workspace_path') { super(code); this.name = 'CatalogError' }
}
const text = z.string().trim().min(1)
const id = <B extends string>() => text.transform(value => brandString<Branded<B>>(value))
const sourceSchema = z.strictObject({ sourceId: id<'loom.source'>(), ref: text })
const versionSchema = z.strictObject({ id: id<'loom.version'>(), projectId: id<'loom.project'>(), name: text, sources: z.array(sourceSchema).min(1) })
const lockSchema = z.strictObject({ id: id<'loom.lock'>(), versionId: id<'loom.version'>(), repositories: z.array(z.strictObject({ sourceId: id<'loom.source'>(), commit: z.string().regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u) })).min(1) })
const status = z.enum(['running', 'review', 'completed', 'failed'])
const taskSchema = z.strictObject({ id: id<'loom.task'>(), versionId: id<'loom.version'>(), title: text, status: z.enum(['pending', 'running', 'review', 'completed', 'failed']), attempts: z.array(z.strictObject({ id: id<'loom.attempt'>(), lock: lockSchema, workspaceId: id<'loom.workspace'>(), sessionIds: z.array(id<'SessionId'>()), status })) })
const workspaceSchema = z.strictObject({ id: id<'loom.workspace'>(), path: z.string().refine(value => isAbsolute(value) && normalize(value) === value), versionId: id<'loom.version'>(), lockId: id<'loom.lock'>() })
const schema = z.strictObject({
  projects: z.array(z.strictObject({ id: id<'loom.project'>(), config: z.unknown().transform(parseProject) })),
  versions: z.array(versionSchema), locks: z.array(lockSchema), tasks: z.array(taskSchema), workspaces: z.array(workspaceSchema),
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
  workspaceChanges(workspaceId: WorkspaceRecord['id']): Promise<{ repositories: Awaited<ReturnType<typeof workingTreeChanges>> }>
  registerPreparedWorkspace(input: { path: string; versionId: Lock['versionId']; lockId: Lock['id'] }): Promise<WorkspaceRecord>
  startAttempt(taskId: TaskRecord['id'], workspaceId: WorkspaceRecord['id']): Promise<TaskRecord>
  attachSession(taskId: TaskRecord['id'], sessionId: Branded<'SessionId'>): Promise<TaskRecord>
  transitionTask(taskId: TaskRecord['id'], target: TaskStatus, actor: 'human' | 'agent'): Promise<TaskRecord>
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
    state = { projects: [], versions: [], locks: [], tasks: [], workspaces: [] }
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
  function workspaceIn(draft: CatalogSnapshot, workspaceId: WorkspaceRecord['id']): WorkspaceRecord {
    const workspace = draft.workspaces.find(item => item.id === workspaceId)
    if (!workspace) throw new CatalogError('missing_workspace')
    return workspace
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
      const repositories = project.config.sources.map(source => {
        const pinned = lock.repositories.find(repository => repository.sourceId === source.id)
        if (pinned === undefined) throw new CatalogError('workspace_mismatch')
        return { repo: source.repo, path: source.path, commit: pinned.commit }
      })
      await materializeWorkspace(input.path, repositories)
      const record = { id: brandString<WorkspaceRecord['id']>(randomUUID()), path: input.path, versionId: version.id, lockId: lock.id }
      draft.workspaces.push(record)
      return record
    }),
    workspaceChanges: async workspaceId => {
      const workspaceRecord = state.workspaces.find(item => item.id === workspaceId)
      if (!workspaceRecord) throw new CatalogError('missing_workspace')
      const version = state.versions.find(item => item.id === workspaceRecord.versionId)
      if (!version) throw new CatalogError('missing_version')
      const project = state.projects.find(item => item.id === version.projectId)
      if (!project) throw new CatalogError('missing_project')
      const lock = state.locks.find(item => item.id === workspaceRecord.lockId)
      if (!lock) throw new CatalogError('missing_lock')
      const worktrees = project.config.sources.map(source => {
        const pinned = lock.repositories.find(repository => repository.sourceId === source.id)
        if (pinned === undefined) throw new CatalogError('workspace_mismatch')
        return { repo: source.repo, directory: resolve(workspaceRecord.path, source.path), commit: pinned.commit }
      })
      return { repositories: await workingTreeChanges(worktrees) }
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
        return record
      })
    },
    startAttempt: (taskId, workspaceId) => transaction(draft => {
      const task = taskIn(draft, taskId)
      const workspace = workspaceIn(draft, workspaceId)
      const lock = draft.locks.find(item => item.id === workspace.lockId)
      if (!lock) throw new CatalogError('missing_lock')
      const updated = { ...task, ...startAttempt(task, brandString<Branded<'loom.attempt'>>(randomUUID()), lock, workspace) }
      draft.tasks[draft.tasks.indexOf(task)] = updated
      return updated
    }),
    attachSession: (taskId, sessionId) => transaction(draft => {
      const task = taskIn(draft, taskId)
      const updated = { ...task, ...attachSession(task, sessionId) }
      draft.tasks[draft.tasks.indexOf(task)] = updated
      return updated
    }),
    transitionTask: (taskId, target, actor) => transaction(draft => {
      const task = taskIn(draft, taskId)
      const updated = { ...task, ...transitionTask(task, target, actor) }
      draft.tasks[draft.tasks.indexOf(task)] = updated
      return updated
    }),
    snapshot: () => structuredClone(state),
    createProject: async input => {
      const config = parseProject(input)
      return transaction(draft => {
        const record = { id: brandString<ProjectRecord['id']>(randomUUID()), config }
        draft.projects.push(record); return record
      })
    },
    createVersion: async (projectId, name, sources) => {
      const record = versionSchema.parse({ id: randomUUID(), projectId, name, sources })
      return transaction(draft => {
        const project = draft.projects.find(p => p.id === projectId)
        if (!project) throw new CatalogError('missing_project')
        if (!validVersion(project, record)) throw new CatalogError('invalid_version')
        draft.versions.push(record); return record
      })
    },
    generateLock: versionId => transaction(async draft => {
      const version = versionIn(draft, versionId)
      const project = draft.projects.find(p => p.id === version.projectId)!
      const lock = await resolveLock(project.config, version, randomUUID(), resolveCommit)
      draft.locks.push(lock); return lock
    }),
    createTask: async (versionId, title) => {
      const admittedTitle = text.parse(title)
      return transaction(draft => {
        versionIn(draft, versionId)
        const record = { ...pendingTask(brandString<Task['id']>(randomUUID()), versionId), title: admittedTitle }
        draft.tasks.push(record); return record
      })
    },
  }
}
