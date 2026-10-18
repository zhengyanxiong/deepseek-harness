/** Owner-only Loom catalog Remote service with quiescent disposal. */
import { Context, Service } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-api-remote-access'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { createCatalog, type Catalog } from './catalog.ts'
import type {
  AttachSessionRequest, CatalogSnapshot, CreateTaskRequest, CreateVersionRequest, GenerateLockRequest,
  CleanupWorkspaceRequest, PrepareWorkspaceRequest, ProjectConfig, ProjectRecord, RegisterWorkspaceRequest, StartAttemptRequest, TaskRecord, TransitionTaskRequest, WorkspaceChangesRequest, WorkspaceRepositoryChangesRecord, WorkspaceStatusResult,
  VersionRecord, WorkspaceRecord, ExecutionRequest, ReleaseExecutionRequest,
} from '../types.ts'
import type { Lock } from '../domain/task.ts'
import { ExecutionError, type ExecutionState, type StopOutcome } from '../domain/execution.ts'
import { resolveCommit } from '../git/workspace.ts'
import type {} from './events.ts'
import type { LoomAgent } from './events.ts'

/** Absolute catalog file and optional workspace parent; the service creates missing directories. */
export interface Config { catalogFile: string; workspacesDir?: string }
const absolute = Schema.transform(Schema.string().required(), value => {
  if (!isAbsolute(value) || normalize(value) !== value) throw new Error('path must be absolute and normalized')
  return value
})
const configSchema: Schema<Config> = Schema.object({
  catalogFile: absolute.required(),
  workspacesDir: absolute,
})
const nonempty = z.string().trim().min(1)
const versionRequest = z.strictObject({ projectId: nonempty, name: nonempty, sources: z.array(z.strictObject({ sourceId: nonempty, ref: nonempty })).min(1) })
const taskRequest = z.strictObject({ versionId: nonempty, title: nonempty, description: z.string().max(4000).optional(), moduleIds: z.array(nonempty).max(50).optional(), priority: z.enum(['low', 'normal', 'high']).optional() })
const lockRequest = z.strictObject({ versionId: nonempty })
const workspaceRequest = z.strictObject({ path: nonempty.optional(), versionId: nonempty, lockId: nonempty })
const registerWorkspaceRequest = z.strictObject({ path: nonempty, versionId: nonempty, lockId: nonempty, branches: z.record(z.string(), nonempty).optional() })
const attemptRequest = z.strictObject({ taskId: nonempty, workspaceId: nonempty })
const sessionRequest = z.strictObject({ taskId: nonempty, sessionId: nonempty })
const transitionRequest = z.strictObject({ taskId: nonempty, target: z.enum(['pending', 'running', 'review', 'completed', 'failed']), actor: z.enum(['human', 'agent']) })
const workspaceChangesRequest = z.strictObject({ workspaceId: nonempty })
const cleanupWorkspaceRequest = z.strictObject({ workspaceId: nonempty, discardChanges: z.boolean().optional() })
const executionRequest = z.strictObject({ workspaceId: nonempty, sessionId: nonempty })
const releaseExecutionRequest = z.strictObject({ workspaceId: nonempty, sessionId: nonempty, generation: z.number().int().nonnegative() })

declare module '@deepseek-ai/cordis' { interface Context { loom: LoomService } }

/** Global catalog administration; Remote calls require the Host owner's principal. */
export default class LoomService extends TypertRemoteService {
  static inject = ['remoteAccess', 'typert']
  static Config = configSchema
  private readonly catalog: Promise<Catalog>
  private readonly pending = new Set<Promise<unknown>>()
  private readonly workspacesDir: string
  private closed = false

  constructor(ctx: Context, config: Config) {
    super(ctx, 'loom')
    const admitted = configSchema(config)
    this.workspacesDir = admitted.workspacesDir ?? join(dirname(admitted.catalogFile), 'workspaces')
    mkdirSync(dirname(admitted.catalogFile), { recursive: true })
    mkdirSync(this.workspacesDir, { recursive: true })
    this.catalog = createCatalog(admitted.catalogFile, resolveCommit)
    // Observe startup rejection even if disposal wins before Cordis invokes init.
    void this.catalog.catch(() => undefined)
    ctx.effect(() => async () => {
      this.closed = true
      await Promise.allSettled([this.catalog, ...this.pending])
    }, 'loom: settle catalog operations')
  }

  async [Service.init](): Promise<void> {
    const catalog = await this.catalog
    for (const workspace of catalog.snapshot().workspaces) {
      if (workspace.cleaned === true) continue
      try { await catalog.ensureWorkspaceBranches(workspace.id) } catch (error) { this.ctx.logger.warn(`loom: branch reconciliation failed for ${workspace.path}: ${String(error)}`) }
    }
    this.ctx.on('tools/pre-execute', async (exec, next) => {
      if (exec.agent === undefined) return next()
      const decision = await this.admitExecution(exec.agent.session.id)
      return decision ?? next()
    })
    this.ctx.on('agent/status', ({ agent, status }) => {
      if (status === 'idle') void this.releaseSession(agent.session.id)
    })
    this.ctx.on('session/disposed', session => { void this.releaseSession(session.id) })
  }

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

  /**
   * Acquire or enqueue execution access for one Loom-attached Session.
   * The Agent tool gate calls the same transition before allowing a tool call.
   * @param sessionId - Session observed on the Agent runtime.
   * @returns a denial when another Session holds the workspace, otherwise undefined.
   */
  private async admitExecution(sessionId: Branded<'SessionId'>): Promise<{ readonly kind: 'deny'; readonly reason: string } | undefined> {
    try {
      const catalog = await this.catalog
      if (this.closed) return undefined
      const snapshot = catalog.snapshot()
      const task = [...snapshot.tasks].reverse().find(candidate => candidate.attempts.some(attempt => attempt.sessionIds.includes(sessionId)))
      const attempt = task === undefined ? undefined : [...task.attempts].reverse().find(candidate => candidate.sessionIds.includes(sessionId))
      const workspace = attempt === undefined ? undefined : snapshot.workspaces.find(candidate => candidate.id === attempt.workspaceId && candidate.cleaned !== true)
      if (workspace === undefined) return undefined
      const current = snapshot.executions.find(execution => execution.workspaceId === workspace.id)
      if (current?.owner?.sessionId === sessionId) return undefined
      if (current?.waiting.includes(sessionId) === true) return { kind: 'deny', reason: 'Loom workspace execution is queued behind another session.' }
      const state = await catalog.acquireExecution(workspace.id, sessionId)
      if (state.owner?.sessionId === sessionId) return undefined
      return { kind: 'deny', reason: 'Loom workspace execution is held by another session. Wait for handoff or request takeover.' }
    } catch {
      return { kind: 'deny', reason: 'Loom execution state is unavailable; the tool call was not executed.' }
    }
  }

  private async releaseSession(sessionId: Branded<'SessionId'>): Promise<void> {
    try {
      const catalog = await this.catalog
      if (this.closed) return
      await catalog.releaseSession(sessionId)
    } catch {
      // Teardown cleanup is best effort; the tool gate still refuses a non-owner.
    }
  }

  /**
   * Stop one owning Agent turn and wait for observable idleness.
   * Child Agents are not separately awaited; the owner's turn cancellation is the
   * stop evidence this Host can observe.
   * @param sessionId - Session holding the current workspace execution token.
   * @returns the trusted stop outcome used to confirm or block handoff.
   */
  private async stopOwner(sessionId: Branded<'SessionId'>): Promise<StopOutcome> {
    const agents = this.ctx.get('agents') as { get(id: Branded<'SessionId'>): LoomAgent | undefined } | undefined
    if (agents === undefined) return 'unknown'
    const agent = agents.get(sessionId)
    if (agent === undefined || agent.status !== 'running') return 'stopped'
    try {
      agent.cancel({ kind: 'user' }, { keepInbox: true })
    } catch {
      return 'failed'
    }
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if (agent.status !== 'running') return 'stopped'
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return 'unknown'
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
      return catalog.createTask(brandString<VersionRecord['id']>(parsed.versionId), parsed.title, {
        ...(parsed.description === undefined ? {} : { description: parsed.description }),
        ...(parsed.moduleIds === undefined ? {} : { moduleIds: parsed.moduleIds.map(moduleId => brandString<Branded<'loom.module'>>(moduleId)) }),
        ...(parsed.priority === undefined ? {} : { priority: parsed.priority }),
      })
    })
  }

  /** Materialize a workspace from a version Lock and record it. @param request - owning baseline and an optional absolute root. @returns persisted workspace. */
  @Remote
  prepareWorkspace(request: PrepareWorkspaceRequest): Promise<WorkspaceRecord> {
    return this.run(catalog => {
      const parsed = workspaceRequest.parse(request)
      const path = parsed.path ?? join(this.workspacesDir, `workspace-${randomUUID().slice(0, 8)}`)
      return catalog.prepareWorkspace({
        path,
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

  /** Read whether a workspace is owned by a running task and what it has changed. @param request - prepared workspace identity. @returns ownership and changes. */
  @Remote
  workspaceStatus(request: WorkspaceChangesRequest): Promise<WorkspaceStatusResult> {
    return this.run(catalog => catalog.workspaceStatus(brandString<WorkspaceRecord['id']>(workspaceChangesRequest.parse(request).workspaceId)))
  }

  /** Remove a retained workspace after explicit confirmation. @param request - workspace and whether uncommitted changes may be discarded. @returns nothing after worktrees and the record are gone. */
  @Remote
  cleanupWorkspace(request: CleanupWorkspaceRequest): Promise<void> {
    return this.run(async catalog => {
      const parsed = cleanupWorkspaceRequest.parse(request)
      await catalog.cleanupWorkspace(brandString<WorkspaceRecord['id']>(parsed.workspaceId), parsed.discardChanges === true)
    })
  }

  /** Record a prepared workspace whose files already exist. @param request - absolute path and owning baseline. @returns persisted workspace. */
  @Remote
  registerWorkspace(request: RegisterWorkspaceRequest): Promise<WorkspaceRecord> {
    return this.run(async catalog => {
      const parsed = registerWorkspaceRequest.parse(request)
      const workspace = await catalog.registerPreparedWorkspace({
        path: parsed.path,
        versionId: brandString<Lock['versionId']>(parsed.versionId),
        lockId: brandString<Lock['id']>(parsed.lockId),
        ...(parsed.branches === undefined ? {} : { branches: parsed.branches }),
      })
      return catalog.ensureWorkspaceBranches(workspace.id)
    })
  }

  /** Start the next execution round on a prepared workspace. @param request - task and workspace identities. @returns the running task. */
  @Remote
  startAttempt(request: StartAttemptRequest): Promise<TaskRecord> {
    return this.run(async catalog => {
      const parsed = attemptRequest.parse(request)
      const workspaceId = brandString<WorkspaceRecord['id']>(parsed.workspaceId)
      await catalog.ensureWorkspaceBranches(workspaceId)
      return catalog.startAttempt(brandString<TaskRecord['id']>(parsed.taskId), workspaceId)
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

  /** Acquire workspace execution access or join its FIFO wait queue. @param request - workspace and requesting Session. @returns the committed scheduling state. */
  @Remote
  acquireExecution(request: ExecutionRequest): Promise<ExecutionState> {
    return this.run(catalog => {
      const parsed = executionRequest.parse(request)
      return catalog.acquireExecution(
        brandString<WorkspaceRecord['id']>(parsed.workspaceId),
        brandString<Branded<'SessionId'>>(parsed.sessionId),
      )
    })
  }

  /** Release an exact owned generation after its Agent turn settles. @param request - workspace, Session and generation. @returns the scheduling state after FIFO promotion. */
  @Remote
  releaseExecution(request: ReleaseExecutionRequest): Promise<ExecutionState> {
    return this.run(catalog => {
      const parsed = releaseExecutionRequest.parse(request)
      const workspaceId = brandString<WorkspaceRecord['id']>(parsed.workspaceId)
      const sessionId = brandString<Branded<'SessionId'>>(parsed.sessionId)
      const state = catalog.snapshot().executions.find(candidate => candidate.workspaceId === workspaceId)
      if (state?.owner?.sessionId !== sessionId || Number(state.owner.generation) !== parsed.generation) throw new Error('stale_owner')
      return catalog.releaseExecution(workspaceId, state.owner)
    })
  }

  /**
   * Stop the current owner through the Agent runtime, then confirm or block handoff.
   * @param request - workspace and the Session requesting ownership.
   * @returns the state after confirmed stop, or the blocked takeover state.
   */
  @Remote
  async takeoverExecution(request: ExecutionRequest): Promise<ExecutionState> {
    if (this.ctx.invocation?.peer.principal.kind !== 'owner') throw new Error('owner_required')
    if (this.closed) throw new Error('loom_disposed')
    const parsed = executionRequest.parse(request)
    const workspaceId = brandString<WorkspaceRecord['id']>(parsed.workspaceId)
    const sessionId = brandString<Branded<'SessionId'>>(parsed.sessionId)
    const call = (async () => {
      const catalog = await this.catalog
      if (this.closed) throw new Error('loom_disposed')
      const begun = await catalog.beginTakeover(workspaceId, sessionId)
      const outcome = await this.stopOwner(begun.owner.sessionId)
      try {
        return await catalog.finishTakeover(workspaceId, begun.owner, outcome)
      } catch (error) {
        if (!(error instanceof ExecutionError) || error.code !== 'stale_owner') throw error
        const settled = catalog.snapshot().executions.find(candidate => candidate.workspaceId === workspaceId)
        if (settled?.owner?.sessionId !== sessionId) throw error
        return settled
      }
    })()
    this.pending.add(call)
    void call.then(() => this.pending.delete(call), () => this.pending.delete(call))
    return call
  }
}
