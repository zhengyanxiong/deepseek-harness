import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { createCatalog, type ProjectRecord } from '../src/host/catalog.ts'
const exec = promisify(execFile)
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
it('persists optional task metadata and rejects modules outside the project', async () => {
  const { catalog } = await fixture()
  const project = await catalog.createProject({ name: 'Shop', sources: [{ id: 'web', repo: '/repos/web', path: 'web' }], modules: [{ id: 'api', sourceId: 'web', path: 'src/api' }] })
  const version = await catalog.createVersion(project.id, 'Release', [{ sourceId: project.config.sources[0]!.id, ref: 'main' }])
  const moduleId = project.config.modules[0]!.id
  const task = await catalog.createTask(version.id, 'Checkout', { description: 'Review totals', moduleIds: [moduleId], priority: 'high' })
  expect(task).toMatchObject({ description: 'Review totals', moduleIds: [moduleId], priority: 'high' })
  await expect(catalog.createTask(version.id, 'Bad', { moduleIds: [brandString<Branded<'loom.module'>>('missing')] })).rejects.toThrow('invalid_task')
})

it('edits projects, versions and tasks while preserving referenced ids', async () => {
  const { catalog } = await fixture()
  const project = await catalog.createProject({ name: 'Shop', sources: [{ id: 'web', repo: '/repos/web', path: 'web' }], modules: [{ id: 'api', sourceId: 'web', path: 'src/api' }] })
  const version = await catalog.createVersion(project.id, 'Release', [{ sourceId: project.config.sources[0]!.id, ref: 'main' }])
  const task = await catalog.createTask(version.id, 'Checkout', { moduleIds: [project.config.modules[0]!.id] })
  const updatedProject = await catalog.updateProject(project.id, {
    name: 'Shop renamed',
    sources: [{ id: project.config.sources[0]!.id, repo: '/repos/renamed', path: 'web' }],
    modules: [{ id: project.config.modules[0]!.id, sourceId: project.config.sources[0]!.id, path: 'src/api' }],
  })
  expect(updatedProject.config).toMatchObject({ name: 'Shop renamed', sources: [{ id: 'web', repo: '/repos/renamed' }] })
  const updatedVersion = await catalog.updateVersion(version.id, 'Release 2', [{ sourceId: project.config.sources[0]!.id, ref: 'release' }])
  expect(updatedVersion).toMatchObject({ name: 'Release 2', sources: [{ sourceId: 'web', ref: 'release' }] })
  const updatedTask = await catalog.updateTask(task.id, 'Checkout 2', { description: 'Updated', moduleIds: [project.config.modules[0]!.id], priority: 'high' })
  expect(updatedTask).toMatchObject({ title: 'Checkout 2', description: 'Updated', priority: 'high' })
  expect(catalog.snapshot().audit.map(entry => entry.event)).toEqual(expect.arrayContaining(['project.updated', 'version.updated', 'task.updated']))
})

it('rejects edits that would orphan versions or tasks', async () => {
  const { catalog } = await fixture()
  const project = await catalog.createProject({ name: 'Shop', sources: [{ id: 'web', repo: '/repos/web', path: 'web' }, { id: 'api', repo: '/repos/api', path: 'api' }], modules: [{ id: 'core', sourceId: 'api', path: 'src/core' }] })
  const version = await catalog.createVersion(project.id, 'Release', [{ sourceId: project.config.sources[1]!.id, ref: 'main' }])
  await catalog.createTask(version.id, 'Checkout', { moduleIds: [project.config.modules[0]!.id] })
  await expect(catalog.updateProject(project.id, { name: 'Shop', sources: [project.config.sources[0]!], modules: [] })).rejects.toThrow('invalid_version')
  await expect(catalog.updateProject(project.id, { name: 'Shop', sources: [project.config.sources[0]!, project.config.sources[1]!], modules: [] })).rejects.toThrow('invalid_task')
})

it('deletes tasks, versions and projects only after dependent records are gone', async () => {
  const { file, catalog } = await fixture()
  const project = await catalog.createProject(config())
  const version = await catalog.createVersion(project.id, 'Release', [{ sourceId: project.config.sources[0]!.id, ref: 'main' }])
  const task = await catalog.createTask(version.id, 'Checkout')
  await expect(catalog.deleteProject(project.id)).rejects.toThrow('project_has_versions')
  await expect(catalog.deleteVersion(version.id)).rejects.toThrow('version_has_tasks')
  await catalog.deleteTask(task.id)
  expect(catalog.snapshot().tasks).toEqual([])
  await catalog.generateLock(version.id)
  await catalog.deleteVersion(version.id)
  expect(catalog.snapshot().versions).toEqual([])
  expect(catalog.snapshot().locks).toEqual([])
  await catalog.deleteProject(project.id)
  expect(catalog.snapshot().projects).toEqual([])
  expect(catalog.snapshot().audit.map(entry => entry.event)).toEqual(expect.arrayContaining(['task.deleted', 'version.deleted', 'project.deleted']))
  expect((await createCatalog(file, async () => 'b'.repeat(40))).snapshot()).toEqual(catalog.snapshot())
})

it('refuses to delete still-running tasks or versions referenced by workspaces', async () => {
  const { catalog } = await fixture()
  const project = await catalog.createProject(config())
  const version = await catalog.createVersion(project.id, 'Release', [{ sourceId: project.config.sources[0]!.id, ref: 'main' }])
  const lock = await catalog.generateLock(version.id)
  const workspace = await catalog.registerPreparedWorkspace({ path: '/tmp/loom-delete-guard', versionId: version.id, lockId: lock.id })
  await expect(catalog.deleteVersion(version.id)).rejects.toThrow('version_has_workspaces')
  const task = await catalog.createTask(version.id, 'Checkout')
  await catalog.startAttempt(task.id, workspace.id)
  await expect(catalog.deleteTask(task.id)).rejects.toThrow('task_busy')
  await catalog.transitionTask(task.id, 'failed', 'human')
  await expect(catalog.deleteTask(task.id)).rejects.toThrow('task_workspace_uncleaned')
  expect(catalog.snapshot().tasks).toHaveLength(1)
})

it('fills metadata defaults for tasks persisted before those fields existed', async () => {
  const { file, catalog } = await fixture()
  const project = await catalog.createProject(config())
  const version = await catalog.createVersion(project.id, 'Release', [{ sourceId: project.config.sources[0]!.id, ref: 'main' }])
  await catalog.createTask(version.id, 'Legacy')
  const stored = JSON.parse(await readFile(file, 'utf8')) as { data: { tasks: Record<string, unknown>[] } }
  delete stored.data.tasks[0]!.description
  delete stored.data.tasks[0]!.moduleIds
  delete stored.data.tasks[0]!.priority
  await writeFile(file, JSON.stringify(stored))
  const reopened = await createCatalog(file, async () => 'b'.repeat(40))
  expect(reopened.snapshot().tasks[0]).toMatchObject({ description: '', moduleIds: [], priority: 'normal' })
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

it('records durable audit entries for business mutations', async () => {
  const { file, catalog } = await fixture()
  const project = await catalog.createProject(config())
  const version = await catalog.createVersion(project.id, 'Release', [{ sourceId: project.config.sources[0]!.id, ref: 'main' }])
  const lock = await catalog.generateLock(version.id)
  const task = await catalog.createTask(version.id, 'Checkout')
  const workspace = await catalog.registerPreparedWorkspace({ path: '/tmp/loom-audit', versionId: version.id, lockId: lock.id })
  const started = await catalog.startAttempt(task.id, workspace.id)
  const attached = await catalog.attachSession(started.id, brandString<Branded<'SessionId'>>('session-a'))
  await catalog.transitionTask(attached.id, 'review', 'agent')
  const events = catalog.snapshot().audit.map(entry => entry.event)
  expect(events).toEqual([
    'project.created', 'version.created', 'lock.generated', 'task.created', 'workspace.prepared',
    'attempt.started', 'session.attached', 'task.transitioned',
  ])
  expect(catalog.snapshot().audit.at(-1)).toMatchObject({ actor: 'agent', taskId: task.id, detail: 'running->review' })
  const reopened = await createCatalog(file, async () => 'b'.repeat(40))
  expect(reopened.snapshot().audit).toEqual(catalog.snapshot().audit)
})

it('serializes execution ownership, FIFO waiting, confirmed handoff and Session teardown', async () => {
  const { catalog } = await fixture()
  const project = await catalog.createProject(config())
  const version = await catalog.createVersion(project.id, 'v', [{ sourceId: project.config.sources[0]!.id, ref: 'main' }])
  const lock = await catalog.generateLock(version.id)
  const workspace = await catalog.registerPreparedWorkspace({ path: '/tmp/loom-execution', versionId: version.id, lockId: lock.id })
  const a = brandString<Branded<'SessionId'>>('session-a')
  const b = brandString<Branded<'SessionId'>>('session-b')
  const first = await catalog.acquireExecution(workspace.id, a)
  expect(first.owner?.sessionId).toBe(a)
  const waiting = await catalog.acquireExecution(workspace.id, b)
  expect(waiting.owner?.sessionId).toBe(a)
  expect(waiting.waiting).toEqual([b])
  const promoted = await catalog.releaseExecution(workspace.id, first.owner!)
  expect(promoted.owner?.sessionId).toBe(b)
  const takeover = await catalog.beginTakeover(workspace.id, a)
  expect(takeover.state.owner?.sessionId).toBe(b)
  expect(takeover.state.takeover).toEqual({ sessionId: a, stopStatus: 'requested' })
  const blocked = await catalog.finishTakeover(workspace.id, takeover.owner, 'unknown')
  expect(blocked.owner?.sessionId).toBe(b)
  expect(blocked.takeover).toEqual({ sessionId: a, stopStatus: 'unknown' })
  const resumed = await catalog.beginTakeover(workspace.id, a)
  const handed = await catalog.finishTakeover(workspace.id, resumed.owner, 'stopped')
  expect(handed.owner?.sessionId).toBe(a)
  expect(handed.takeover).toBeNull()
  await catalog.releaseSession(a)
  expect(catalog.snapshot().executions[0]).toMatchObject({ owner: null, waiting: [] })
  const events = catalog.snapshot().audit.map(entry => entry.event)
  expect(events).toContain('execution.acquired')
  expect(events).toContain('execution.queued')
  expect(events).toContain('execution.released')
  expect(events).toContain('execution.takeover-requested')
  expect(events).toContain('execution.takeover-blocked')
  expect(events).toContain('execution.takeover-stopped')
})

it('loads a catalog written before audit and execution records existed', async () => {
  const { file } = await fixture()
  await writeFile(file, JSON.stringify({ schema: 'loom-json-store', version: 1, data: { projects: [], versions: [], locks: [], tasks: [], workspaces: [] } }))
  const catalog = await createCatalog(file, async () => 'a'.repeat(40))
  expect(catalog.snapshot().audit).toEqual([])
  expect(catalog.snapshot().executions).toEqual([])
  expect(catalog.snapshot().temporarySessions).toEqual([])
})

it('tracks temporary Sessions until they attach to a task or are forgotten', async () => {
  const { catalog } = await fixture()
  const project = await catalog.createProject(config())
  const version = await catalog.createVersion(project.id, 'v', [{ sourceId: project.config.sources[0]!.id, ref: 'main' }])
  const lock = await catalog.generateLock(version.id)
  const workspace = await catalog.registerPreparedWorkspace({ path: '/tmp/loom-temporary', versionId: version.id, lockId: lock.id })
  const temporary = brandString<Branded<'SessionId'>>('session-temporary')
  const bound = brandString<Branded<'SessionId'>>('session-bound')
  expect(await catalog.registerTemporarySession(temporary, workspace.path)).toMatchObject({ sessionId: temporary, workspacePath: workspace.path })
  await expect(catalog.registerTemporarySession(bound, '/tmp/loom-missing')).rejects.toThrow('missing_workspace')
  expect(catalog.snapshot().temporarySessions.map(row => row.sessionId)).toEqual([temporary])
  await catalog.forgetTemporarySession(temporary)
  expect(catalog.snapshot().temporarySessions).toEqual([])
  await catalog.registerTemporarySession(bound, workspace.path)
  const task = await catalog.createTask(version.id, 'Checkout')
  await catalog.startAttempt(task.id, workspace.id)
  await catalog.attachSession(task.id, bound)
  expect(catalog.snapshot().temporarySessions).toEqual([])
})

it('shares an idle workspace between tasks in one version and refuses while another task runs', async () => {
  const { catalog } = await fixture()
  const project = await catalog.createProject(config())
  const version = await catalog.createVersion(project.id, 'v', [{ sourceId: project.config.sources[0]!.id, ref: 'main' }])
  const lock = await catalog.generateLock(version.id)
  const first = await catalog.createTask(version.id, 'first')
  const second = await catalog.createTask(version.id, 'second')
  const workspace = await catalog.registerPreparedWorkspace({ path: '/tmp/loom-shared', versionId: version.id, lockId: lock.id })
  const running = await catalog.startAttempt(first.id, workspace.id)
  expect(running.attempts[0]?.workspaceId).toBe(workspace.id)
  await expect(catalog.startAttempt(second.id, workspace.id)).rejects.toThrow('workspace_task_running')
  await catalog.transitionTask(first.id, 'failed', 'human')
  const shared = await catalog.startAttempt(second.id, workspace.id)
  expect(shared.status).toBe('running')
  expect(shared.attempts[0]?.workspaceId).toBe(workspace.id)
  expect(shared.attempts[0]?.lock.id).toBe(lock.id)
})


it('creates worktrees on caller-selected branches recorded with the workspace', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'loom-catalog-')); dirs.push(dir)
  const repo = join(dir, 'repo')
  await mkdir(repo)
  await exec('git', ['init', '--quiet', repo])
  await exec('git', ['-C', repo, 'config', 'user.name', 'Loom Test'])
  await exec('git', ['-C', repo, 'config', 'user.email', 'loom@example.invalid'])
  await writeFile(join(repo, 'file.txt'), 'content')
  await exec('git', ['-C', repo, 'add', 'file.txt'])
  await exec('git', ['-C', repo, 'commit', '--quiet', '-m', 'initial'])
  const resolveHead = async (): Promise<string> => (await exec('git', ['-C', repo, 'rev-parse', 'HEAD'])).stdout.trim()
  const catalog = await createCatalog(join(dir, 'state.json'), resolveHead)
  const project = await catalog.createProject({ name: 'Shop', sources: [{ id: 'web', repo, path: 'web' }], modules: [] })
  const version = await catalog.createVersion(project.id, 'Release', [{ sourceId: project.config.sources[0]!.id, ref: 'HEAD' }])
  const lock = await catalog.generateLock(version.id)
  const branch = 'loom/Release/web-test0001'
  const workspace = await catalog.prepareWorkspace({ path: join(dir, 'workspace'), versionId: version.id, lockId: lock.id, branches: { web: branch } })
  expect(workspace.branches?.['web']).toBe(branch)
  expect((await exec('git', ['-C', join(workspace.path, 'web'), 'symbolic-ref', '--short', 'HEAD'])).stdout.trim()).toBe(branch)
  expect((await exec('git', ['-C', repo, 'branch', '--list', branch!])).stdout).toContain(branch)
  await catalog.cleanupWorkspace(workspace.id, true)
  expect((await exec('git', ['-C', repo, 'branch', '--list', branch!])).stdout.trim()).toBe('')
})

it('keeps a detached workspace detached when no branch was recorded', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'loom-catalog-')); dirs.push(dir)
  const repo = join(dir, 'repo')
  await mkdir(repo)
  await exec('git', ['init', '--quiet', repo])
  await exec('git', ['-C', repo, 'config', 'user.name', 'Loom Test'])
  await exec('git', ['-C', repo, 'config', 'user.email', 'loom@example.invalid'])
  await writeFile(join(repo, 'file.txt'), 'content')
  await exec('git', ['-C', repo, 'add', 'file.txt'])
  await exec('git', ['-C', repo, 'commit', '--quiet', '-m', 'initial'])
  const commit = (await exec('git', ['-C', repo, 'rev-parse', 'HEAD'])).stdout.trim()
  const root = join(dir, 'legacy')
  await mkdir(root)
  await exec('git', ['-C', repo, 'worktree', 'add', '--detach', '--', join(root, 'web'), commit])
  const catalog = await createCatalog(join(dir, 'state.json'), async () => commit)
  const project = await catalog.createProject({ name: 'Shop', sources: [{ id: 'web', repo, path: 'web' }], modules: [] })
  const version = await catalog.createVersion(project.id, 'Release', [{ sourceId: project.config.sources[0]!.id, ref: 'HEAD' }])
  const lock = await catalog.generateLock(version.id)
  const workspace = await catalog.registerPreparedWorkspace({ path: root, versionId: version.id, lockId: lock.id })
  expect(workspace.branches).toBeUndefined()
  const reconciled = await catalog.ensureWorkspaceBranches(workspace.id)
  expect(reconciled.branches).toBeUndefined()
  await expect(exec('git', ['-C', join(root, 'web'), 'symbolic-ref', '--short', 'HEAD'])).rejects.toThrow()
})
