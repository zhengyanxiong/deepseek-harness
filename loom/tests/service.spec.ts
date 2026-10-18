import { Context } from '@deepseek-ai/cordis'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import Registry from '@deepseek-ai/dsh-typert-registry'
import Access from '@deepseek-ai/dsh-api-remote-access'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
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
  const workspace = await call('registerWorkspace', { request: { path: join(dir, 'ws'), versionId: version.id, lockId: lock.id } }) as { id: string }
  const started = await call('startAttempt', { request: { taskId: task.id, workspaceId: workspace.id } }) as { status: string; attempts: { workspaceId: string; lock: { id: string }; sessionIds: string[] }[] }
  expect(started).toMatchObject({ status: 'running', attempts: [{ workspaceId: workspace.id, lock: { id: lock.id }, sessionIds: [] }] })
  const attached = await call('attachSession', { request: { taskId: task.id, sessionId: 'session-1' } }) as { attempts: { sessionIds: string[] }[] }
  expect(attached).toMatchObject({ attempts: [{ sessionIds: ['session-1'] }] })
  await expect(call('transitionTask', { request: { taskId: task.id, target: 'completed', actor: 'agent' } })).rejects.toThrow()
  expect(await call('transitionTask', { request: { taskId: task.id, target: 'review', actor: 'agent' } })).toMatchObject({ status: 'review' })
  expect(await call('transitionTask', { request: { taskId: task.id, target: 'completed', actor: 'human' } })).toMatchObject({ status: 'completed', attempts: [{ status: 'completed' }] })
  expect(await call('snapshot')).toMatchObject({ workspaces: [{ id: workspace.id }], tasks: [{ id: task.id, status: 'completed' }] })
})
