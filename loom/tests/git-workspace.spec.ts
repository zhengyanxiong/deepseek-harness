import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { prepareWorkspace, resolveCommit, workingTreeStatus, WorkspacePreparationError } from '../src/git/workspace.ts'

const exec = promisify(execFile)
const roots: string[] = []
async function fixture(format: 'sha1' | 'sha256' = 'sha1') {
  const base = await mkdtemp(join(tmpdir(), 'loom-git-test-'))
  roots.push(base)
  const repos: string[] = []
  for (const name of ['first', 'second']) {
    const repo = join(base, name)
    await mkdir(repo)
    await exec('git', ['init', '--quiet', `--object-format=${format}`, repo])
    await exec('git', ['-C', repo, 'config', 'user.name', 'Loom Test'])
    await exec('git', ['-C', repo, 'config', 'user.email', 'loom@example.invalid'])
    await writeFile(join(repo, 'file.txt'), name)
    await exec('git', ['-C', repo, 'add', 'file.txt'])
    await exec('git', ['-C', repo, 'commit', '--quiet', '-m', 'initial'])
    repos.push(repo)
  }
  return { base, first: repos[0]!, second: repos[1]!, root: join(base, 'workspace') }
}
afterEach(async () => {
  for (const base of roots.splice(0)) {
    if (!resolve(base).startsWith(join(tmpdir(), 'loom-git-test-'))) throw new Error('unsafe test cleanup')
    await rm(base, { recursive: true, force: true })
  }
})
it('prepares two detached worktrees under nested directories and reports changes', async () => {
  const f = await fixture()
  const one = await resolveCommit(f.first, 'HEAD')
  const two = await resolveCommit(f.second, 'HEAD')
  const result = await prepareWorkspace(f.root, [
    { repo: f.first, path: 'apps/frontend', commit: one },
    { repo: f.second, path: 'services/backend', commit: two },
  ])
  expect(result.worktrees).toHaveLength(2)
  expect(await readFile(join(f.root, 'apps/frontend/file.txt'), 'utf8')).toBe('first')
  expect(await workingTreeStatus(join(f.root, 'apps/frontend'))).toBe('')
  await writeFile(join(f.root, 'apps/frontend/file.txt'), 'user change')
  expect(await workingTreeStatus(join(f.root, 'apps/frontend'))).toContain(' M file.txt')
  expect(await resolveCommit(join(f.root, 'services/backend'), 'HEAD')).toBe(two)
})
it('prepares a workspace from a SHA-256 repository', async () => {
  const f = await fixture('sha256')
  const commit = await resolveCommit(f.first, 'HEAD')
  expect(commit).toHaveLength(64)
  await prepareWorkspace(f.root, [{ repo: f.first, path: 'app', commit }])
  expect(await resolveCommit(join(f.root, 'app'), 'HEAD')).toBe(commit)
})
it('uses the requested commit even when the caller mutates input after invocation', async () => {
  const f = await fixture()
  const commit = await resolveCommit(f.first, 'HEAD')
  const repositories = [{ repo: f.first, path: 'app', commit }]
  const pending = prepareWorkspace(f.root, repositories)
  repositories[0]!.commit = 'f'.repeat(40)
  repositories[0]!.path = '../escape'
  await pending
  expect(await resolveCommit(join(f.root, 'app'), 'HEAD')).toBe(commit)
})
it('rolls back only worktrees created in a failed preparation', async () => {
  const f = await fixture()
  const commit = await resolveCommit(f.first, 'HEAD')
  let failure: unknown
  try {
    await prepareWorkspace(f.root, [{ repo: f.first, path: 'nested/first', commit }, { repo: f.second, path: 'nested/second', commit: 'f'.repeat(40) }])
  } catch (error) { failure = error }
  expect(failure).toBeInstanceOf(WorkspacePreparationError)
  expect((failure as WorkspacePreparationError).rollbackErrors).toEqual([])
  await expect(access(f.root)).rejects.toThrow()
  const listing = await exec('git', ['-C', f.first, 'worktree', 'list', '--porcelain'])
  expect(listing.stdout).not.toContain(f.root)
  expect(await readFile(join(f.first, 'file.txt'), 'utf8')).toBe('first')
})
it('creates a real branch for each worktree instead of a detached HEAD', async () => {
  const f = await fixture()
  const commit = await resolveCommit(f.first, 'HEAD')
  const branch = 'loom/v1/first-1a2b3c4d'
  await prepareWorkspace(f.root, [{ repo: f.first, path: 'app', commit, branch }])
  expect((await exec('git', ['-C', join(f.root, 'app'), 'symbolic-ref', '--short', 'HEAD'])).stdout.trim()).toBe(branch)
  expect((await exec('git', ['-C', f.first, 'branch', '--list', branch])).stdout).toContain(branch)
  expect(await resolveCommit(join(f.root, 'app'), 'HEAD')).toBe(commit)
})
it('deletes branches created by a workspace that fails to prepare', async () => {
  const f = await fixture()
  const commit = await resolveCommit(f.first, 'HEAD')
  const branch = 'loom/v1/first-abcd1234'
  await expect(prepareWorkspace(f.root, [
    { repo: f.first, path: 'first', commit, branch },
    { repo: f.second, path: 'second', commit: 'f'.repeat(40) },
  ])).rejects.toThrow()
  expect((await exec('git', ['-C', f.first, 'branch', '--list', branch])).stdout.trim()).toBe('')
  await expect(access(f.root)).rejects.toThrow()
})
it('refuses an existing root without deleting or overwriting user files', async () => {
  const f = await fixture()
  await mkdir(f.root)
  await writeFile(join(f.root, 'keep.txt'), 'keep')
  await expect(prepareWorkspace(f.root, [{ repo: f.first, path: 'first', commit: await resolveCommit(f.first, 'HEAD') }])).rejects.toThrow()
  expect(await readFile(join(f.root, 'keep.txt'), 'utf8')).toBe('keep')
})
it.each(['../escape', '/absolute', 'a/../../escape', 'a\\escape', '.git', ''])('rejects unsafe destination %s before creating root', async path => {
  const f = await fixture()
  await expect(prepareWorkspace(f.root, [{ repo: f.first, path, commit: await resolveCommit(f.first, 'HEAD') }])).rejects.toThrow('invalid_path')
  await expect(access(f.root)).rejects.toThrow()
})
it('rejects overlapping paths before creating anything', async () => {
  const f = await fixture()
  const commit = await resolveCommit(f.first, 'HEAD')
  await expect(prepareWorkspace(f.root, [{ repo: f.first, path: 'a', commit }, { repo: f.first, path: 'a/b', commit }])).rejects.toThrow('overlapping_paths')
  await expect(access(f.root)).rejects.toThrow()
})
it('reports the repository path and Git diagnostic for an unreadable repository', async () => {
  const f = await fixture()
  const plain = join(f.base, 'plain')
  await mkdir(plain)
  const failure = await resolveCommit(plain, 'HEAD').catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(WorkspacePreparationError)
  expect((failure as WorkspacePreparationError).code).toBe('invalid_repository')
  expect((failure as WorkspacePreparationError).message).toContain(plain)
  expect((failure as WorkspacePreparationError).message).toMatch(/not a git repository|dubious ownership|spawn git/iu)
})

it('rejects Git option-shaped refs and nonlocal repository sources', async () => {
  const f = await fixture()
  await expect(resolveCommit(f.first, '--help')).rejects.toThrow()
  await expect(resolveCommit('https://example.invalid/repo', 'HEAD')).rejects.toThrow('local_repository_required')
})
