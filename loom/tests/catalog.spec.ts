import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { createCatalog, type ProjectRecord } from '../src/host/catalog.ts'
const dirs: string[] = []
afterEach(async () => { for (const dir of dirs.splice(0)) { if (!resolve(dir).startsWith(join(tmpdir(), 'loom-catalog-'))) throw Error('unsafe cleanup'); await rm(dir, { recursive: true, force: true }) } })
async function fixture() { const dir = await mkdtemp(join(tmpdir(), 'loom-catalog-')); dirs.push(dir); const file = join(dir, 'state.json'); return { file, catalog: await createCatalog(file, async () => 'a'.repeat(40)) } }
const config = () => ({ name: 'Shop', sources: [{ id: 'web', repo: '/repos/web', path: 'web' }], modules: [] })
it('persists project, version, Lock and pending task across reopening', async () => {
  const { file, catalog } = await fixture()
  const project = await catalog.createProject(config())
  const version = await catalog.createVersion(project.id, 'Release', [{ sourceId: project.config.sources[0]!.id, ref: 'main' }])
  const lock = await catalog.generateLock(version.id)
  const task = await catalog.createTask(version.id, 'Implement checkout')
  expect(task.status).toBe('pending'); expect(task.attempts).toEqual([])
  expect(lock.repositories[0]?.commit).toBe('a'.repeat(40))
  expect((await createCatalog(file, async () => 'b'.repeat(40))).snapshot()).toEqual(catalog.snapshot())
})
it('serializes concurrent creates without losing records', async () => {
  const { catalog } = await fixture()
  await Promise.all(Array.from({ length: 12 }, () => catalog.createProject(config())))
  expect(catalog.snapshot().projects).toHaveLength(12)
})
it('rejects missing referents and invalid version refs', async () => {
  const { catalog } = await fixture()
  await expect(catalog.createVersion(brandString<ProjectRecord['id']>('missing'), 'v', [])).rejects.toThrow()
  const project = await catalog.createProject(config()); const sourceId = project.config.sources[0]!.id
  for (const sources of [[], [{ sourceId, ref: ' ' }], [{ sourceId, ref: 'main' }, { sourceId, ref: 'other' }]]) await expect(catalog.createVersion(project.id, 'v', sources)).rejects.toThrow()
  expect(catalog.snapshot().versions).toEqual([])
})
it('rejects invalid project configuration without publishing', async () => {
  const { catalog } = await fixture(); const input = config(); input.sources[0]!.path = '../escape'
  await expect(catalog.createProject(input)).rejects.toThrow()
  expect(catalog.snapshot().projects).toEqual([])
})
it('returns detached records and snapshots', async () => {
  const { catalog } = await fixture(); const project = await catalog.createProject(config())
  const snapshot = catalog.snapshot(); snapshot.projects.splice(0)
  expect(catalog.snapshot().projects[0]?.id).toBe(project.id)
})
it('does not publish a transaction when the catalog file cannot be written', async () => {
  const { file, catalog } = await fixture()
  const before = catalog.snapshot()
  const directory = file.slice(0, file.lastIndexOf('/'))
  await rm(directory, { recursive: true, force: true })
  await expect(catalog.createProject(config())).rejects.toThrow()
  expect(catalog.snapshot()).toEqual(before)
})
it('does not publish a Lock after resolution failure and permits later operations', async () => {
  const { file } = await fixture(); const catalog = await createCatalog(file, async () => { throw Error('offline') })
  const p = await catalog.createProject(config()); const v = await catalog.createVersion(p.id, 'v', [{ sourceId: p.config.sources[0]!.id, ref: 'main' }])
  await expect(catalog.generateLock(v.id)).rejects.toThrow('offline')
  expect(catalog.snapshot().locks).toEqual([]); await catalog.createTask(v.id, 'next')
})

it('registers a prepared workspace and starts a task attempt against its Lock', async () => {
  const { catalog } = await fixture()
  const project = await catalog.createProject(config())
  const version = await catalog.createVersion(project.id, 'Release', [{ sourceId: project.config.sources[0]!.id, ref: 'main' }])
  const lock = await catalog.generateLock(version.id)
  const task = await catalog.createTask(version.id, 'Implement checkout')
  const workspace = await catalog.registerPreparedWorkspace({ path: '/tmp/loom-prepared', versionId: version.id, lockId: lock.id })
  const running = await catalog.startAttempt(task.id, workspace.id)
  expect(running.status).toBe('running')
  expect(running.attempts[0]?.workspaceId).toBe(workspace.id)
  expect(running.attempts[0]?.lock.id).toBe(lock.id)
})
it('continues the current attempt and reuses its workspace across sessions and reload', async () => {
  const { file, catalog } = await fixture()
  const project = await catalog.createProject(config()); const version = await catalog.createVersion(project.id, 'v', [{ sourceId: project.config.sources[0]!.id, ref: 'main' }]); const lock = await catalog.generateLock(version.id); const task = await catalog.createTask(version.id, 'task')
  const workspace = await catalog.registerPreparedWorkspace({ path: '/tmp/loom-prepared', versionId: version.id, lockId: lock.id })
  const first = await catalog.startAttempt(task.id, workspace.id); const continued = await catalog.attachSession(first.id, brandString<Branded<'SessionId'>>('session-a')); const twice = await catalog.attachSession(continued.id, brandString<Branded<'SessionId'>>('session-b'))
  expect(twice.attempts).toHaveLength(1); expect(twice.attempts[0]?.workspaceId).toBe(workspace.id); expect(twice.attempts[0]?.sessionIds).toEqual(['session-a', 'session-b'])
  const reopened = await createCatalog(file, async () => 'b'.repeat(40)); expect(reopened.snapshot().tasks[0]?.attempts[0]?.workspaceId).toBe(workspace.id); expect(reopened.snapshot().tasks[0]?.attempts[0]?.sessionIds).toEqual(['session-a', 'session-b'])
})
it('requires a compatible workspace and human authority for terminal transitions', async () => {
  const { catalog } = await fixture(); const project = await catalog.createProject(config()); const version = await catalog.createVersion(project.id, 'v', [{ sourceId: project.config.sources[0]!.id, ref: 'main' }]); const lock = await catalog.generateLock(version.id); const task = await catalog.createTask(version.id, 'task')
  const other = await catalog.registerPreparedWorkspace({ path: '/tmp/other', versionId: version.id, lockId: lock.id }); await expect(catalog.startAttempt(task.id, other.id)).resolves.toMatchObject({ status: 'running' })
  await expect(catalog.transitionTask(task.id, 'completed', 'agent')).rejects.toThrow('human_confirmation_required')
  await expect(catalog.transitionTask(task.id, 'review', 'agent')).resolves.toMatchObject({ status: 'review' })
  await expect(catalog.transitionTask(task.id, 'completed', 'human')).resolves.toMatchObject({ status: 'completed' })
})
it('rejects dangling workspace associations while loading persisted state', async () => {
  const { file, catalog } = await fixture(); const project = await catalog.createProject(config()); const version = await catalog.createVersion(project.id, 'v', [{ sourceId: project.config.sources[0]!.id, ref: 'main' }]); const lock = await catalog.generateLock(version.id); await catalog.createTask(version.id, 'task')
  const snapshot = catalog.snapshot(); snapshot.tasks[0] = { ...snapshot.tasks[0]!, status: 'running', attempts: [{ id: brandString<Branded<'loom.attempt'>>('attempt-missing'), lock, workspaceId: brandString<Branded<'loom.workspace'>>('workspace-missing'), sessionIds: [], status: 'running' }] }; snapshot.workspaces = []
  await writeFile(file, JSON.stringify({ schema: 'loom-json-store', version: 1, data: snapshot }))
  await expect(createCatalog(file, async () => 'a'.repeat(40))).rejects.toThrow('corrupt')
})

it.each(['syntax', 'references', 'duplicate', 'status'])('refuses corrupt persisted data: %s', async corruption => {
  const { file, catalog } = await fixture(); const p = await catalog.createProject(config()); const v = await catalog.createVersion(p.id, 'v', [{ sourceId: p.config.sources[0]!.id, ref: 'main' }]); await catalog.createTask(v.id, 'task')
  const snapshot = catalog.snapshot()
  let data: unknown = snapshot
  if (corruption === 'references') data = { ...snapshot, projects: [] }
  if (corruption === 'duplicate') data = { ...snapshot, projects: [...snapshot.projects, ...snapshot.projects] }
  if (corruption === 'status') data = { ...snapshot, tasks: snapshot.tasks.map(t => ({ ...t, status: 'garbage' })) }
  const text = corruption === 'syntax' ? '{' : JSON.stringify({ schema: 'loom-json-store', version: 1, data })
  await writeFile(file, text)
  await expect(createCatalog(file, async () => 'a'.repeat(40))).rejects.toThrow('corrupt')
  expect(await readFile(file, 'utf8')).toBe(text)
})
