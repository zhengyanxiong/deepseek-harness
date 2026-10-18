/** Owner-only Loom catalog Remote service with quiescent disposal. */
import { Context, Service } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-api-remote-access'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { z } from 'zod'
import { createCatalog, type Catalog } from './catalog.ts'
import type {
  AttachSessionRequest, CatalogSnapshot, CreateTaskRequest, CreateVersionRequest, GenerateLockRequest,
  PrepareWorkspaceRequest, ProjectConfig, ProjectRecord, RegisterWorkspaceRequest, StartAttemptRequest, TaskRecord, TransitionTaskRequest, WorkspaceChangesRequest, WorkspaceRepositoryChangesRecord,
  VersionRecord, WorkspaceRecord,
} from '../types.ts'
import type { Lock } from '../domain/task.ts'
import { resolveCommit } from '../git/workspace.ts'

/** Absolute catalog file with one owning process; the service creates missing parent directories. */
export interface Config { catalogFile: string }
const configSchema: Schema<Config> = Schema.object({ catalogFile: Schema.transform(Schema.string().required(), value => {
  if (!isAbsolute(value)) throw new Error('catalogFile must be absolute')
  return value
}).required() })
const nonempty = z.string().trim().min(1)
const versionRequest = z.strictObject({ projectId: nonempty, name: nonempty, sources: z.array(z.strictObject({ sourceId: nonempty, ref: nonempty })).min(1) })
const taskRequest = z.strictObject({ versionId: nonempty, title: nonempty })
const lockRequest = z.strictObject({ versionId: nonempty })
const workspaceRequest = z.strictObject({ path: nonempty, versionId: nonempty, lockId: nonempty })
const attemptRequest = z.strictObject({ taskId: nonempty, workspaceId: nonempty })
const sessionRequest = z.strictObject({ taskId: nonempty, sessionId: nonempty })
const transitionRequest = z.strictObject({ taskId: nonempty, target: z.enum(['pending', 'running', 'review', 'completed', 'failed']), actor: z.enum(['human', 'agent']) })
const workspaceChangesRequest = z.strictObject({ workspaceId: nonempty })

declare module '@deepseek-ai/cordis' { interface Context { loom: LoomService } }

/** Global catalog administration; Remote calls require the Host owner's principal. */
export default class LoomService extends TypertRemoteService {
  static inject = ['remoteAccess', 'typert']
  static Config = configSchema
  private readonly catalog: Promise<Catalog>
  private readonly pending = new Set<Promise<unknown>>()
  private closed = false

  constructor(ctx: Context, config: Config) {
    super(ctx, 'loom')
    const admitted = configSchema(config)
    mkdirSync(dirname(admitted.catalogFile), { recursive: true })
    this.catalog = createCatalog(admitted.catalogFile, resolveCommit)
    // Observe startup rejection even if disposal wins before Cordis invokes init.
    void this.catalog.catch(() => undefined)
    ctx.effect(() => async () => {
      this.closed = true
      await Promise.allSettled([this.catalog, ...this.pending])
    }, 'loom: settle catalog operations')
  }

  async [Service.init](): Promise<void> { await this.catalog }

  private run<T>(operation: (catalog: Catalog) => T | Promise<T>): Promise<T> {
    if (this.ctx.invocation?.peer.principal.kind !== 'owner') throw new Error('owner_required')
    if (this.closed) throw new Error('loom_disposed')
    const call = this.catalog.then(catalog => {
      if (this.closed) throw new Error('loom_disposed')
      return operation(catalog)
    })
    this.pending.add(call)
    void call.then(() => this.pending.delete(call), () => this.pending.delete(call))
    return call
  }

  /** Read a detached catalog snapshot. @returns current committed records. */
  @Remote
  snapshot(): Promise<CatalogSnapshot> { return this.run(catalog => catalog.snapshot()) }

  /** Admit imported project JSON. @param request - project configuration. @returns persisted project. */
  @Remote
  createProject(request: ProjectConfig): Promise<ProjectRecord> { return this.run(catalog => catalog.createProject(request)) }

  /** Create a version. @param request - project, title and repository refs. @returns persisted version. */
  @Remote
  createVersion(request: CreateVersionRequest): Promise<VersionRecord> {
    return this.run(catalog => {
      const parsed = versionRequest.parse(request)
      return catalog.createVersion(brandString<ProjectRecord['id']>(parsed.projectId), parsed.name, parsed.sources.map(source => ({ sourceId: brandString<VersionRecord['sources'][number]['sourceId']>(source.sourceId), ref: source.ref })))
    })
  }

  /** Resolve all version refs. @param request - owning version. @returns immutable Lock. */
  @Remote
  generateLock(request: GenerateLockRequest): Promise<Lock> {
    return this.run(catalog => catalog.generateLock(brandString<VersionRecord['id']>(lockRequest.parse(request).versionId)))
  }

  /** Create a pending task. @param request - fixed version and title. @returns persisted task. */
  @Remote
  createTask(request: CreateTaskRequest): Promise<TaskRecord> {
    return this.run(catalog => {
      const parsed = taskRequest.parse(request)
      return catalog.createTask(brandString<VersionRecord['id']>(parsed.versionId), parsed.title)
    })
  }

  /** Materialize a workspace from a version Lock and record it. @param request - absolute root and owning baseline. @returns persisted workspace. */
  @Remote
  prepareWorkspace(request: PrepareWorkspaceRequest): Promise<WorkspaceRecord> {
    return this.run(catalog => {
      const parsed = workspaceRequest.parse(request)
      return catalog.prepareWorkspace({
        path: parsed.path,
        versionId: brandString<Lock['versionId']>(parsed.versionId),
        lockId: brandString<Lock['id']>(parsed.lockId),
      })
    })
  }

  /** Read every repository's changes against a workspace Lock. @param request - prepared workspace identity. @returns changed files and hunks per repository. */
  @Remote
  workspaceChanges(request: WorkspaceChangesRequest): Promise<{ repositories: WorkspaceRepositoryChangesRecord[] }> {
    return this.run(catalog => catalog.workspaceChanges(brandString<WorkspaceRecord['id']>(workspaceChangesRequest.parse(request).workspaceId)))
  }

  /** Record a prepared workspace whose files already exist. @param request - absolute path and owning baseline. @returns persisted workspace. */
  @Remote
  registerWorkspace(request: RegisterWorkspaceRequest): Promise<WorkspaceRecord> {
    return this.run(catalog => {
      const parsed = workspaceRequest.parse(request)
      return catalog.registerPreparedWorkspace({
        path: parsed.path,
        versionId: brandString<Lock['versionId']>(parsed.versionId),
        lockId: brandString<Lock['id']>(parsed.lockId),
      })
    })
  }

  /** Start the next execution round on a prepared workspace. @param request - task and workspace identities. @returns the running task. */
  @Remote
  startAttempt(request: StartAttemptRequest): Promise<TaskRecord> {
    return this.run(catalog => {
      const parsed = attemptRequest.parse(request)
      return catalog.startAttempt(
        brandString<TaskRecord['id']>(parsed.taskId),
        brandString<WorkspaceRecord['id']>(parsed.workspaceId),
      )
    })
  }

  /** Associate another native Session with the current round. @param request - task and Session identities. @returns the updated task. */
  @Remote
  attachSession(request: AttachSessionRequest): Promise<TaskRecord> {
    return this.run(catalog => {
      const parsed = sessionRequest.parse(request)
      return catalog.attachSession(brandString<TaskRecord['id']>(parsed.taskId), brandString<Branded<'SessionId'>>(parsed.sessionId))
    })
  }

  /** Change business status under the trusted caller identity. @param request - task, target state and actor. @returns the updated task. */
  @Remote
  transitionTask(request: TransitionTaskRequest): Promise<TaskRecord> {
    return this.run(catalog => {
      const parsed = transitionRequest.parse(request)
      return catalog.transitionTask(brandString<TaskRecord['id']>(parsed.taskId), parsed.target, parsed.actor)
    })
  }
}
