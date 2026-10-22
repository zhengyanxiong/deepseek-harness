import { Context } from '@deepseek-ai/cordis'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import Registry from '@deepseek-ai/dsh-typert-registry'
import Access from '@deepseek-ai/dsh-api-remote-access'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import Schema from '@deepseek-ai/schemastery'
import Loom from '../src/index.ts'

declare module '@deepseek-ai/dsh-typert-protocol' { interface PrincipalMap { loomGuest: { kind: 'loomGuest' } } }
const contexts: Context[] = []
const dirs: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const dir of dirs.splice(0)) { if (!resolve(dir).startsWith(join(tmpdir(), 'loom-service-'))) throw Error('unsafe cleanup'); await rm(dir, { recursive: true, force: true }) }
})
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'loom-service-')); dirs.push(dir)
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(Registry); await ctx.plugin(Access); await ctx.plugin(Gateway)
  const fiber = ctx.plugin(Loom, { catalogFile: join(dir, 'catalog.json') }); await fiber
  const peer = new Peer(ctx, { principal: { kind: 'owner' } })
  const call = (method: string, args: Record<string, unknown> = {}) => ctx.typertGateway.invoke({ namespace: 'loom', method, args, peer })
  return { ctx, call, fiber, dir }
}
it('creates durable catalog records through the real gateway', async () => {
  const { call } = await setup()
  const project = await call('createProject', { request: { name: 'Shop', sources: [{ id: 'web', repo: '/local/web', path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v1', sources: [{ sourceId: 'web', ref: 'main' }] } }) as { id: string }
  await call('createTask', { request: { versionId: version.id, title: 'Checkout' } })
  expect(await call('snapshot')).toMatchObject({ projects: [{ id: project.id }], tasks: [{ title: 'Checkout', status: 'pending' }] })
})
it('edits catalog records through the real gateway', async () => {
  const { call } = await setup()
  const project = await call('createProject', { request: { name: 'Shop', sources: [{ id: 'web', repo: '/local/web', path: 'web' }], modules: [{ id: 'api', sourceId: 'web', path: 'src/api' }] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v1', sources: [{ sourceId: 'web', ref: 'main' }] } }) as { id: string }
  const task = await call('createTask', { request: { versionId: version.id, title: 'Checkout' } }) as { id: string }
  const updatedProject = await call('updateProject', { request: { projectId: project.id, config: { name: 'Shop 2', sources: [{ id: 'web', repo: '/local/renamed', path: 'web' }], modules: [{ id: 'api', sourceId: 'web', path: 'src/api' }] } } }) as { config: { name: string } }
  const updatedVersion = await call('updateVersion', { request: { versionId: version.id, name: 'v2', sources: [{ sourceId: 'web', ref: 'release' }] } }) as { name: string }
  const updatedTask = await call('updateTask', { request: { taskId: task.id, title: 'Checkout 2', priority: 'high' } }) as { title: string; priority: string }
  expect(updatedProject.config.name).toBe('Shop 2')
  expect(updatedVersion.name).toBe('v2')
  expect(updatedTask).toMatchObject({ title: 'Checkout 2', priority: 'high' })
})

it('deletes catalog records through the real gateway', async () => {
  const { call } = await setup()
  const project = await call('createProject', { request: { name: 'Shop', sources: [{ id: 'web', repo: '/local/web', path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v1', sources: [{ sourceId: 'web', ref: 'main' }] } }) as { id: string }
  const task = await call('createTask', { request: { versionId: version.id, title: 'Checkout' } }) as { id: string }
  await expect(call('deleteProject', { request: { projectId: project.id } })).rejects.toThrow('project_has_versions')
  await call('deleteTask', { request: { taskId: task.id } })
  await call('deleteVersion', { request: { versionId: version.id } })
  await call('deleteProject', { request: { projectId: project.id } })
  expect(await call('snapshot')).toMatchObject({ projects: [], versions: [], tasks: [] })
})

it('resolves exact Git commits through the Lock endpoint', async () => {
  const { call, dir } = await setup()
  const repo = join(dir, 'repo'); await mkdir(repo)
  const exec = promisify(execFile)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Git', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } })
  expect(lock).toMatchObject({ versionId: version.id, repositories: [{ sourceId: 'web', commit: (await exec('git', ['-C', repo, 'rev-parse', 'HEAD'])).stdout.trim() }] })
})
it('creates a missing catalog parent directory on init', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'loom-service-')); dirs.push(dir)
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(Registry); await ctx.plugin(Access); await ctx.plugin(Gateway)
  const file = join(dir, 'nested', 'deeper', 'catalog.json')
  await ctx.plugin(Loom, { catalogFile: file })
  const envelope = JSON.parse(await readFile(file, 'utf8')) as { schema: string; data: { projects: unknown[] } }
  expect(envelope).toMatchObject({ schema: 'loom-json-store', data: { projects: [] } })
})
it('materializes a workspace from a Lock through the gateway', async () => {
  const { call, dir } = await setup()
  const repo = join(dir, 'repo'); await mkdir(repo)
  const exec = promisify(execFile)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Git', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const root = join(dir, 'workspace')
  const workspace = await call('prepareWorkspace', { request: { path: root, versionId: version.id, lockId: lock.id } }) as { id: string; path: string }
  expect(workspace.path).toBe(root)
  expect(await readFile(join(root, 'web', 'file'), 'utf8')).toBe('content')
  expect(await call('snapshot')).toMatchObject({ workspaces: [{ id: workspace.id, versionId: version.id, lockId: lock.id }] })
  expect(await call('registerTemporarySession', { request: { sessionId: 'session-temp', workspacePath: root } })).toMatchObject({ sessionId: 'session-temp', workspacePath: root })
  expect(await call('snapshot')).toMatchObject({ temporarySessions: [{ sessionId: 'session-temp', workspacePath: root }] })
  await call('forgetTemporarySession', { request: { sessionId: 'session-temp' } })
  expect(await call('snapshot')).toMatchObject({ temporarySessions: [] })
  await writeFile(join(root, 'web', 'file'), 'changed\nsecond\n')
  await writeFile(join(root, 'web', 'new.txt'), 'added\n')
  await writeFile(join(root, 'web', 'Loom上下文.md'), 'unicode path\n')
  const changes = await call('workspaceChanges', { request: { workspaceId: workspace.id } }) as { repositories: { files: { path: string; added: number; deleted: number; before: boolean; after: boolean; hunks: { lines: string[] }[] }[] }[] }
  const files = changes.repositories[0]!.files
  expect(files.map(file => file.path).sort((left, right) => left.localeCompare(right))).toEqual(['file', 'Loom上下文.md', 'new.txt'].sort((left, right) => left.localeCompare(right)))
  const changed = files.find(file => file.path === 'file')!
  expect(changed.added).toBe(2)
  expect(changed.deleted).toBe(1)
  expect(changed.before).toBe(true)
  expect(changed.after).toBe(true)
  expect(changed.hunks.flatMap(hunk => hunk.lines)).toContain('-content')
  expect(files.find(file => file.path === 'new.txt')).toMatchObject({ before: false, after: true })
  expect(files.find(file => file.path === 'new.txt')!.hunks[0]!.lines).toEqual(['+added'])
  expect(files.find(file => file.path === 'Loom上下文.md')).toMatchObject({ before: false, after: true })
  expect(await call('workspaceChangeCount', { request: { workspaceId: workspace.id } })).toBe(3)
  const status = await call('workspaceStatus', { request: { workspaceId: workspace.id } }) as { running: boolean; repositories: { files: unknown[] }[] }
  expect(status.running).toBe(false)
  expect(status.repositories[0]!.files).toHaveLength(3)
  await exec('git', ['-C', join(root, 'web'), 'checkout', '--', 'file'])
  await rm(join(root, 'web', 'new.txt'), { force: true })
  await rm(join(root, 'web', 'Loom上下文.md'), { force: true })
  const task = await call('createTask', { request: { versionId: version.id, title: 'Clean' } }) as { id: string }
  await call('startAttempt', { request: { taskId: task.id, workspaceId: workspace.id } })
  const execution = await call('acquireExecution', { request: { workspaceId: workspace.id, sessionId: 'session-owner' } }) as { owner: { generation: number } }
  await expect(call('cleanupWorkspace', { request: { workspaceId: workspace.id } })).rejects.toThrow('workspace_busy')
  await call('releaseExecution', { request: { workspaceId: workspace.id, sessionId: 'session-owner', generation: execution.owner.generation } })
  await writeFile(join(root, 'web', 'file'), 'changed again\n')
  await call('transitionTask', { request: { taskId: task.id, target: 'failed', actor: 'human' } })
  await expect(call('cleanupWorkspace', { request: { workspaceId: workspace.id } })).rejects.toThrow('workspace_changes')
  await rm(join(root, 'web', 'new.txt'), { force: true })
  await writeFile(join(root, 'web', 'file'), 'unpushed\n')
  await exec('git', ['-C', join(root, 'web'), 'add', 'file'])
  await exec('git', ['-C', join(root, 'web'), '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'unpushed'])
  await expect(call('cleanupWorkspace', { request: { workspaceId: workspace.id } })).rejects.toThrow('workspace_unpushed')
  await call('cleanupWorkspace', { request: { workspaceId: workspace.id, discardChanges: true } })
  expect(await call('snapshot')).toMatchObject({ workspaces: [{ id: workspace.id, cleaned: true }] })
  await expect(call('startAttempt', { request: { taskId: task.id, workspaceId: workspace.id } })).rejects.toThrow('workspace_cleaned')
  await expect(readFile(join(root, 'web', 'file'), 'utf8')).rejects.toThrow()
  const recreated = await call('prepareWorkspace', { request: { path: root, versionId: version.id, lockId: lock.id } }) as { id: string }
  await call('cleanupWorkspace', { request: { workspaceId: recreated.id, discardChanges: true } })
  await call('deleteTask', { request: { taskId: task.id } })
  expect(await call('snapshot')).toMatchObject({ tasks: [], workspaces: [] })
  await call('deleteVersion', { request: { versionId: version.id } })
  await call('deleteProject', { request: { projectId: project.id } })
  expect(await call('snapshot')).toMatchObject({ projects: [], versions: [], locks: [], tasks: [], workspaces: [] })
})
it('inspects an existing Git workspace, lists branches and registers it without a default branch', async () => {
  const { call, dir } = await setup()
  const repo = join(dir, 'repo'); await mkdir(repo)
  const exec = promisify(execFile)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  await exec('git', ['-C', repo, 'branch', 'feature/start'])
  const existing = join(dir, 'existing'); await mkdir(existing)
  await exec('git', ['-C', repo, 'worktree', 'add', '--quiet', join(existing, 'web'), 'feature/start'])
  const project = await call('createProject', { request: { name: 'Existing', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'web', ref: 'feature/start' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  expect(await call('repositoryBranches', { request: { repo } })).toMatchObject({ branches: expect.arrayContaining(['feature/start']), current: expect.any(String) })
  const inspection = await call('inspectWorkspace', { request: { path: existing, versionId: version.id } }) as { repositories: { sourceId: string; current?: string; error?: string }[] }
  expect(inspection.repositories[0]).toMatchObject({ sourceId: 'web', current: 'feature/start' })
  const workspace = await call('registerWorkspace', { request: { path: existing, versionId: version.id, lockId: lock.id } }) as { id: string; path: string; branches?: Record<string, string> }
  expect(workspace.path).toBe(existing)
  expect(workspace.branches).toEqual({ web: 'feature/start' })
  const again = await call('registerWorkspace', { request: { path: existing, versionId: version.id, lockId: lock.id } }) as { id: string }
  expect(again.id).toBe(workspace.id)
  const task = await call('createTask', { request: { versionId: version.id, title: 'Existing' } }) as { id: string }
  await writeFile(join(existing, 'web', 'dirty.txt'), 'dirty\n')
  await expect(call('startAttempt', { request: { taskId: task.id, workspaceId: workspace.id } })).rejects.toThrow('workspace_changes')
  await rm(join(existing, 'web', 'dirty.txt'))
  await writeFile(join(existing, 'web', 'committed.txt'), 'committed\n')
  await exec('git', ['-C', join(existing, 'web'), 'add', 'committed.txt'])
  await exec('git', ['-C', join(existing, 'web'), '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'committed'])
  const started = await call('startAttempt', { request: { taskId: task.id, workspaceId: workspace.id } }) as { attempts: unknown[] }
  expect(started.attempts).toHaveLength(1)
  const notGit = join(dir, 'not-git'); await mkdir(notGit)
  await expect(call('registerWorkspace', { request: { path: notGit, versionId: version.id, lockId: lock.id } })).rejects.toThrow('invalid_workspace_path')
})
it('creates its own isolated workspace when the request omits a path', async () => {
  const { call, dir } = await setup()
  const repo = join(dir, 'repo'); await mkdir(repo)
  const exec = promisify(execFile)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Auto', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const workspace = await call('prepareWorkspace', { request: { versionId: version.id, lockId: lock.id } }) as { id: string; path: string }
  expect(workspace.path.startsWith(join(dir, 'workspaces', 'workspace-'))).toBe(true)
  expect(await readFile(join(workspace.path, 'web', 'file'), 'utf8')).toBe('content')
})
it('refuses stale direct service references after disposal', async () => {
  const { ctx, fiber } = await setup()
  const stale = ctx.loom
  await fiber.dispose()
  expect(() => stale.snapshot()).toThrow('owner_required')
})
it('rejects malformed wire payloads without publishing', async () => {
  const { call } = await setup()
  await expect(call('createProject', { request: { name: 'bad', sources: [], modules: [], extra: true } })).rejects.toThrow()
  await expect(call('createTask', { request: { versionId: 12, title: 'x' } })).rejects.toThrow()
  expect(await call('snapshot')).toMatchObject({ projects: [], tasks: [] })
})
it('denies a non-owner even if a global policy grants its endpoint', async () => {
  const { ctx } = await setup()
  ctx.remoteAccess.registerPolicy('loomGuest', { bindings: () => [{ resource: { kind: 'global' }, role: { name: 'test', resource: 'global', actions: ['loom/snapshot'] } }] })
  const peer = new Peer(ctx, { principal: { kind: 'loomGuest' } })
  await expect(ctx.typertGateway.invoke({ namespace: 'loom', method: 'snapshot', args: {}, peer })).rejects.toThrow('owner_required')
})
it('withdraws the service on disposal', async () => {
  const { ctx, call, fiber } = await setup()
  await fiber.dispose()
  expect(ctx.get('loom')).toBeUndefined()
  await expect(call('snapshot')).rejects.toThrow()
})
it('requires an explicit absolute catalog file', () => {
  expect(() => Loom.Config({ catalogFile: 'relative.json' })).toThrow()
  expect(() => Schema.resolve({}, Loom.Config, {})).toThrow()
})
it('runs a task round through a prepared workspace, Session association, review and human completion', async () => {
  const { call, dir } = await setup()
  const repo = join(dir, 'repo'); await mkdir(repo)
  const exec = promisify(execFile)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Closed loop', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const task = await call('createTask', { request: { versionId: version.id, title: 'Checkout' } }) as { id: string }
  const workspace = await call('prepareWorkspace', { request: { path: join(dir, 'ws'), versionId: version.id, lockId: lock.id, branches: { web: 'loom/v1/web-test0001' } } }) as { id: string }
  const started = await call('startAttempt', { request: { taskId: task.id, workspaceId: workspace.id } }) as { status: string; attempts: { workspaceId: string; lock: { id: string }; sessionIds: string[] }[] }
  expect(started).toMatchObject({ status: 'running', attempts: [{ workspaceId: workspace.id, lock: { id: lock.id }, sessionIds: [] }] })
  const attached = await call('attachSession', { request: { taskId: task.id, sessionId: 'session-1' } }) as { attempts: { sessionIds: string[] }[] }
  expect(attached).toMatchObject({ attempts: [{ sessionIds: ['session-1'] }] })
  await expect(call('transitionTask', { request: { taskId: task.id, target: 'completed', actor: 'agent' } })).rejects.toThrow()
  expect(await call('transitionTask', { request: { taskId: task.id, target: 'review', actor: 'agent' } })).toMatchObject({ status: 'review' })
  expect(await call('transitionTask', { request: { taskId: task.id, target: 'completed', actor: 'human' } })).toMatchObject({ status: 'completed', attempts: [{ status: 'completed' }] })
  expect(await call('snapshot')).toMatchObject({ workspaces: [{ id: workspace.id }], tasks: [{ id: task.id, status: 'completed' }] })
})

it('exposes execution acquisition, blocked handoff and release through the gateway', async () => {
  const { call, dir } = await setup()
  const repo = join(dir, 'repo'); await mkdir(repo)
  const exec = promisify(execFile)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Git', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const workspace = await call('prepareWorkspace', { request: { path: join(dir, 'workspace'), versionId: version.id, lockId: lock.id, branches: { web: 'loom/v1/web-test0001' } } }) as { id: string }
  const first = await call('acquireExecution', { request: { workspaceId: workspace.id, sessionId: 'session-a' } }) as { owner: { sessionId: string; generation: number }; waiting: string[] }
  expect(first.owner.sessionId).toBe('session-a')
  const second = await call('acquireExecution', { request: { workspaceId: workspace.id, sessionId: 'session-b' } }) as { owner: { sessionId: string }; waiting: string[] }
  expect(second.owner.sessionId).toBe('session-a')
  expect(second.waiting).toEqual(['session-b'])
  const released = await call('releaseExecution', { request: { workspaceId: workspace.id, sessionId: 'session-a', generation: first.owner.generation } }) as { owner: { sessionId: string; generation: number } }
  expect(released.owner.sessionId).toBe('session-b')
  const takeover = await call('takeoverExecution', { request: { workspaceId: workspace.id, sessionId: 'session-a' } }) as { owner: { sessionId: string }; takeover: { stopStatus: string } }
  expect(takeover.owner.sessionId).toBe('session-b')
  expect(takeover.takeover.stopStatus).toBe('unknown')
  expect((await call('snapshot') as { audit: { event: string }[] }).audit.map(entry => entry.event)).toEqual(expect.arrayContaining(['execution.acquired', 'execution.queued', 'execution.takeover-requested', 'execution.takeover-blocked', 'execution.released']))
})

it('marks linked sessions with full access and gives the Agent the repository map', async () => {
  const { ctx, call, dir } = await setup()
  const exec = promisify(execFile)
  const repo = join(dir, 'repo'); await mkdir(repo)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Linked', sources: [{ id: 'back', repo, path: 'back' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'back', ref: 'HEAD' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const workspace = await call('prepareWorkspace', { request: { path: join(dir, 'linked'), versionId: version.id, lockId: lock.id, mode: 'linked', repositories: [{ sourceId: 'back', path: 'back', targetPath: repo }] } }) as { path: string }
  const events: unknown[] = []
  ctx.emit('session/created', { header: { cwd: workspace.path }, append: (type: string, data: unknown) => { events.push([type, data]) } } as never)
  expect(events).toEqual([['sandbox/mode', { mode: 'danger-full-access' }]])
  const contexts: { text: string }[] = []
  ctx.emit('agent/created', { agent: { session: { header: { cwd: workspace.path } }, ctx: { get: (name: string) => name === 'systemPrompt' ? { context: (context: { text: string }) => { contexts.push(context) } } : undefined } } } as never)
  expect(contexts[0]?.text).toContain(repo)
  expect(contexts[0]?.text).toContain('back')
  expect(contexts[0]?.text).toContain('native session skill catalog')
  expect(contexts[0]?.text).not.toContain('read the relevant SKILL.md directly')
})
