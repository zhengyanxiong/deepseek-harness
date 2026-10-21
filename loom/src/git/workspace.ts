import { execFile as execFileCallback } from 'node:child_process'
import { lstat, mkdir, readdir, rm, rmdir, stat, symlink, unlink } from 'node:fs/promises'
import { promisify } from 'node:util'
import { basename, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'

/** Quote one repository path for Git's `safe.directory`; Git paths use forward slashes on Windows. */
function safeDirectory(path: string): string {
  return process.platform === 'win32' ? path.replaceAll('\\', '/') : path
}

/** Trust only the repository this invocation explicitly targets, then keep user config disabled. */
function trustTarget(args: readonly string[]): string[] {
  const index = args.indexOf('-C')
  const directory = args[index + 1]
  return directory === undefined ? [] : ['-c', `safe.directory=${safeDirectory(directory)}`]
}

async function execFile(command: string, args: string[], options: { windowsHide: boolean }) {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'HOME', 'TMPDIR', 'TMP', 'TEMP']) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  env.GIT_CONFIG_NOSYSTEM = '1'
  env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null'
  env.GIT_TERMINAL_PROMPT = '0'
  return promisify(execFileCallback)(command, ['-c', `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`, ...trustTarget(args), ...args], { ...options, env })
}
const COMMIT = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u

/** One local repository worktree requested for a prepared workspace. */
export interface WorkspaceRepository {
  readonly repo: string
  readonly path: string
  readonly commit: string
  readonly branch?: string
}
/** Result of a successful multi-repository preparation. */
export interface PreparedWorkspace {
  readonly root: string
  readonly worktrees: readonly string[]
}
/** Preparation failure with independent rollback diagnostics. */
export class WorkspacePreparationError extends Error {
  constructor(readonly code: string, readonly rollbackErrors: readonly string[] = [], cause?: unknown, readonly detail?: string) {
    super(`${code}${detail === undefined || detail === '' ? '' : `: ${detail}`}${rollbackErrors.length === 0 ? '' : `; rollback: ${rollbackErrors.join('; ')}`}`, { cause })
    this.name = 'WorkspacePreparationError'
  }
}

/** Keep Git's own diagnostic short enough to travel through a Remote failure. */
function gitDetail(error: unknown): string | undefined {
  const stderr = (error as { stderr?: unknown } | null)?.stderr
  const message = error instanceof Error ? error.message : undefined
  const text = typeof stderr === 'string' && stderr.trim() !== '' ? stderr : message
  if (typeof text !== 'string') return undefined
  const line = text.split(/\r?\n/u).map(part => part.trim()).find(part => part !== '')
  return line === undefined ? undefined : line.slice(0, 300)
}

function safeRelativePath(path: string): string {
  if (path === '.') return '.'
  if (path.length === 0 || isAbsolute(path) || path.includes('\\') || path.includes(':') || /[\x00-\x1f]/u.test(path)
    || path.split('/').some(part => part === '' || part === '.' || part === '..' || part.trim() !== part)) throw new WorkspacePreparationError('invalid_path')
  const normalized = normalize(path)
  if (normalized === '.' || normalized.startsWith(`..${sep}`) || normalized === '..' || normalized.includes(`${sep}.git${sep}`) || normalized.endsWith(`${sep}.git`)) {
    throw new WorkspacePreparationError('invalid_path')
  }
  const parts = normalized.split(sep)
  if (parts.some(part => part === '' || part === '.' || part === '..' || part.toLowerCase() === '.git')) throw new WorkspacePreparationError('invalid_path')
  return normalized
}

function inside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function localRepository(repo: string): Promise<string> {
  if (!isAbsolute(repo) || !(await stat(repo).then(value => value.isDirectory()).catch(() => false))) {
    throw new WorkspacePreparationError('local_repository_required', [], undefined, repo)
  }
  try {
    const result = await execFile('git', ['-C', repo, 'rev-parse', '--show-toplevel'], { windowsHide: true })
    const top = resolve(result.stdout.trim())
    if (!(await stat(top)).isDirectory()) throw new Error('not directory')
    return top
  } catch (error) {
    if (error instanceof WorkspacePreparationError) throw error
    const detail = gitDetail(error)
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new WorkspacePreparationError('git_not_found', [], error, repo)
    if (detail !== undefined && /dubious ownership/iu.test(detail)) throw new WorkspacePreparationError('dubious_ownership', [], error, `${repo} (${detail})`)
    throw new WorkspacePreparationError('invalid_repository', [], error, `${repo}${detail === undefined ? '' : ` (${detail})`}`)
  }
}

/** Resolve one local repository ref to an exact commit using argument-safe Git invocation.
 * @param repo - Absolute local Git repository path.
 * @param ref - Ref expression accepted by Git's commit verifier.
 * @returns the full SHA-1 or SHA-256 commit id.
 */
export async function resolveCommit(repo: string, ref: string): Promise<string> {
  const top = await localRepository(repo)
  if (ref.startsWith('-')) throw new WorkspacePreparationError('invalid_ref', [], undefined, ref)
  try {
    return await verifyCommit(top, ref)
  } catch (error) {
    if (error instanceof WorkspacePreparationError && error.code !== 'invalid_commit') throw error
    const fetched = await fetchCommit(top, ref)
    if (fetched !== undefined) return fetched
    if (error instanceof WorkspacePreparationError) throw error
    const detail = gitDetail(error)
    throw new WorkspacePreparationError('invalid_commit', [], error, `${repo} @ ${ref}${detail === undefined ? '' : ` (${detail})`}`)
  }
}

/** Verify an already-fetched ref expression without network access. */
async function verifyCommit(repo: string, ref: string): Promise<string> {
  try {
    const result = await execFile('git', ['-C', repo, 'rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], { windowsHide: true })
    const commit = result.stdout.trim()
    if (!COMMIT.test(commit)) throw new WorkspacePreparationError('invalid_commit', [], undefined, `${repo} @ ${ref}`)
    return commit
  } catch (error) {
    if (error instanceof WorkspacePreparationError) throw error
    throw new WorkspacePreparationError('invalid_commit', [], error, `${repo} @ ${ref}`)
  }
}

/** Fetch one ref from the repository's default remote and resolve FETCH_HEAD. */
async function fetchCommit(repo: string, ref: string): Promise<string | undefined> {
  if (ref === '' || ref.includes(':') || ref.startsWith('refs/')) return undefined
  let remotes: string
  try { remotes = (await execFile('git', ['-C', repo, 'remote'], { windowsHide: true })).stdout } catch { return undefined }
  const names = remotes.split(/\r?\n/u).map(name => name.trim()).filter(name => name !== '')
  const remote = names.includes('origin') ? 'origin' : names[0]
  if (remote === undefined) return undefined
  try {
    await execFile('git', ['-C', repo, 'fetch', '--no-tags', '--quiet', remote, ref], { windowsHide: true })
    return await verifyCommit(repo, 'FETCH_HEAD')
  } catch { return undefined }
}

/** Return porcelain status for one existing worktree without modifying it.
 * @param worktree - Absolute local worktree path.
 * @returns Git porcelain v1 status, empty when clean.
 */
export async function workingTreeStatus(worktree: string): Promise<string> {
  const top = await localRepository(worktree)
  try {
    const result = await execFile('git', ['-C', top, 'status', '--porcelain=v1', '--untracked-files=all'], { windowsHide: true })
    return result.stdout
  } catch (error) { throw new WorkspacePreparationError('status_failed', [], error) }
}


/** Resolve a worktree's current HEAD without changing it.
 * @param directory - Existing repository directory or worktree.
 * @returns the full current commit id.
 */
export async function resolveHead(directory: string): Promise<string> {
  const top = await localRepository(directory)
  try {
    const commit = (await execFile('git', ['-C', top, 'rev-parse', '--verify', 'HEAD'], { windowsHide: true })).stdout.trim()
    if (!COMMIT.test(commit)) throw new WorkspacePreparationError('invalid_commit', [], undefined, directory)
    return commit
  } catch (error) {
    if (error instanceof WorkspacePreparationError) throw error
    throw new WorkspacePreparationError('invalid_commit', [], error, directory)
  }
}

/** One repository exposed through a link below a Loom-created workspace root. */
export interface LinkedRepository {
  readonly path: string
  readonly target: string
}

/** Create a Loom-owned root and link existing repositories into it.
 * @param root - New absolute workspace root; it must not already exist.
 * @param repositories - Relative link path and existing repository target.
 * @returns created root and link paths; removal only ever deletes the links.
 */
export async function createLinkedWorkspace(root: string, repositories: readonly LinkedRepository[]): Promise<PreparedWorkspace> {
  const rootPath = resolve(root)
  if (!isAbsolute(root)) throw new WorkspacePreparationError('invalid_root')
  if (repositories.length === 0) throw new WorkspacePreparationError('empty_workspace')
  const prepared: { path: string; target: string; link: string }[] = []
  const seen = new Set<string>()
  for (const repository of repositories) {
    if (!isAbsolute(repository.target)) throw new WorkspacePreparationError('invalid_target')
    const target = await localRepository(repository.target)
    const path = safeRelativePath(repository.path)
    if (path === '.') throw new WorkspacePreparationError('invalid_path')
    const link = resolve(rootPath, path)
    if (!inside(rootPath, link)) throw new WorkspacePreparationError('overlapping_paths')
    if ([...seen].some(other => other.toLowerCase() === link.toLowerCase() || inside(other.toLowerCase(), link.toLowerCase()) || inside(link.toLowerCase(), other.toLowerCase()))) throw new WorkspacePreparationError('overlapping_paths')
    seen.add(link)
    if (await exists(link)) throw new WorkspacePreparationError('existing_target')
    prepared.push({ path, target, link })
  }
  if (await exists(rootPath)) throw new WorkspacePreparationError('existing_root')
  await mkdir(rootPath, { recursive: true, mode: 0o700 })
  const created: string[] = []
  try {
    for (const item of prepared) {
      const parent = resolve(item.link, '..')
      await mkdir(parent, { recursive: true })
      await symlink(item.target, item.link, process.platform === 'win32' ? 'junction' : 'dir')
      created.push(item.link)
    }
    return { root: rootPath, worktrees: prepared.map(item => item.link) }
  } catch (error) {
    const rollbackErrors: string[] = []
    for (const link of [...created].reverse()) {
      try { await unlink(link) } catch (rollback) { rollbackErrors.push(`remove link ${link}: ${String(rollback)}`) }
    }
    try { await rm(rootPath, { recursive: true, force: true }) } catch (rollback) { rollbackErrors.push(`remove root ${rootPath}: ${String(rollback)}`) }
    if (error instanceof WorkspacePreparationError) throw new WorkspacePreparationError(error.code, rollbackErrors, error, error.detail)
    throw new WorkspacePreparationError('link_failed', rollbackErrors, error)
  }
}

/** Remove only links created by {@link createLinkedWorkspace}, then the Loom-owned root.
 * @param root - Loom-owned workspace root.
 * @param links - Link paths recorded in the workspace bindings.
 * @returns paths that could not be removed; empty when cleanup completed.
 */
export async function removeLinkedWorkspace(root: string, links: readonly string[]): Promise<string[]> {
  const errors: string[] = []
  for (const link of links) {
    try { await unlink(link) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') errors.push(link)
    }
  }
  try { await rm(join(root, '.dsh'), { recursive: true, force: true }) } catch { errors.push(join(root, '.dsh')) }
  try { await rmdir(root) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') errors.push(root)
  }
  return errors
}

/** Create a task-owned root and detached worktrees; rollback only this call's creations on failure.
 * @param root - New absolute workspace root; it must not already exist.
 * @param repositories - Local repositories and exact commits to materialize.
 * @returns created root and worktree paths.
 */
async function branchTip(repo: string, branch: string): Promise<string | undefined> {
  try {
    return (await execFile('git', ['-C', repo, 'rev-parse', '--verify', `refs/heads/${branch}`], { windowsHide: true })).stdout.trim()
  } catch { return undefined }
}

async function branchCheckedOut(repo: string, branch: string): Promise<boolean> {
  const listing = (await execFile('git', ['-C', repo, 'worktree', 'list', '--porcelain'], { windowsHide: true })).stdout
  return listing.split(/\r?\n/u).some(line => line.trim() === `branch refs/heads/${branch}`)
}

export async function prepareWorkspace(root: string, repositories: readonly WorkspaceRepository[]): Promise<PreparedWorkspace> {
  const requests = repositories.map(request => ({ ...request }))
  const rootPath = resolve(root)
  if (!isAbsolute(root)) throw new WorkspacePreparationError('invalid_root')
  if (repositories.length === 0) throw new WorkspacePreparationError('empty_workspace')
  const prepared: { readonly repo: string; readonly target: string; readonly branch: string | undefined }[] = []
  const seen = new Set<string>()
  for (const request of requests) {
    const repo = await localRepository(request.repo)
    if (!COMMIT.test(request.commit)) throw new WorkspacePreparationError('invalid_commit')
    const path = safeRelativePath(request.path)
    const target = resolve(rootPath, path)
    if ((!inside(rootPath, target) && target !== rootPath) || [...seen].some(other => other.toLowerCase() === target.toLowerCase() || inside(other.toLowerCase(), target.toLowerCase()) || inside(target.toLowerCase(), other.toLowerCase()))) throw new WorkspacePreparationError('overlapping_paths')
    seen.add(target)
    if (await exists(target)) throw new WorkspacePreparationError('existing_target')
    if (request.branch !== undefined && !/^(?![-.])[A-Za-z0-9._/-]+$/u.test(request.branch)) throw new WorkspacePreparationError('invalid_branch')
    prepared.push({ repo, target, branch: request.branch })
  }
  if (await exists(rootPath)) throw new WorkspacePreparationError('existing_root')
  const created: { target: string; repo: string; branch: string | undefined; createdBranch: boolean }[] = []
  const createdDirs: string[] = []
  try {
    await mkdir(rootPath, { mode: 0o700 })
    createdDirs.push(rootPath)
    for (const [index, request] of requests.entries()) {
      const { repo, target } = prepared[index]!
      const parent = resolve(target, '..')
      if (!(await exists(parent))) {
        let cursor = parent
        const missing: string[] = []
        while (cursor !== rootPath && !(await exists(cursor))) {
          missing.push(cursor)
          cursor = resolve(cursor, '..')
        }
        for (const directory of missing.reverse()) {
          await mkdir(directory)
          createdDirs.push(directory)
        }
      }
      let args: string[]
      let createdBranch = false
      if (request.branch === undefined) {
        args = ['-C', repo, 'worktree', 'add', '--detach', '--', target, request.commit]
      } else {
        const tip = await branchTip(repo, request.branch)
        if (tip === undefined) {
          args = ['-C', repo, 'worktree', 'add', '-b', request.branch, '--', target, request.commit]
          createdBranch = true
        } else {
          if (tip !== request.commit) throw new WorkspacePreparationError('branch_mismatch')
          if (await branchCheckedOut(repo, request.branch)) throw new WorkspacePreparationError('branch_checked_out')
          args = ['-C', repo, 'worktree', 'add', '--', target, request.branch]
        }
      }
      await execFile('git', args, { windowsHide: true })
      created.push({ target, repo, branch: request.branch, createdBranch })
    }
    return { root: rootPath, worktrees: created.map(item => item.target) }
  } catch (error) {
    const rollbackErrors: string[] = []
    for (const { target, repo, branch, createdBranch } of [...created].reverse()) {
      try {
        await execFile('git', ['-C', repo, 'worktree', 'remove', '--', target], { windowsHide: true })
        if (branch !== undefined && createdBranch) await execFile('git', ['-C', repo, 'branch', '-D', '--', branch], { windowsHide: true })
      } catch (rollback) { rollbackErrors.push(`remove ${target}: ${String(rollback)}`) }
    }
    for (const directory of [...createdDirs].reverse()) {
      try { await rmdir(directory) }
      catch (rollback) {
        if ((rollback as NodeJS.ErrnoException).code !== 'ENOENT') rollbackErrors.push(`remove directory ${directory}: ${String(rollback)}`)
      }
    }
    if (error instanceof WorkspacePreparationError) throw new WorkspacePreparationError(error.code, rollbackErrors, error, error.detail)
    throw new WorkspacePreparationError('worktree_add_failed', rollbackErrors, error)
  }
}

/** One changed file between a Lock commit and the worktree's current state. */
export interface WorkspaceFileChange {
  readonly path: string
  readonly added: number
  readonly deleted: number
  readonly binary: boolean
  readonly before: boolean
  readonly after: boolean
  readonly hunks: readonly WorkspaceFileHunk[]
}
/** One unified hunk with absolute line numbers, matching the native diff view's input. */
export interface WorkspaceFileHunk {
  readonly oldStart: number
  readonly oldLines: number
  readonly newStart: number
  readonly newLines: number
  readonly lines: readonly string[]
}
/** One repository's working-tree changes since its Lock commit. */
export interface WorkspaceRepositoryChanges {
  readonly repo: string
  readonly directory: string
  readonly files: readonly WorkspaceFileChange[]
}
const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u

function parseDiff(text: string): WorkspaceFileChange[] {
  const files: WorkspaceFileChange[] = []
  let path: string | undefined
  let added = 0
  let deleted = 0
  let binary = false
  let before = true
  let after = true
  let hunks: WorkspaceFileHunk[] = []
  let current: { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] } | undefined
  const flushFile = (): void => {
    if (path !== undefined) files.push({ path, added, deleted, binary, before, after, hunks })
    path = undefined; added = 0; deleted = 0; binary = false; before = true; after = true; hunks = []; current = undefined
  }
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      flushFile()
      const match = /^diff --git a\/(.*?) b\/(.*)$/u.exec(line)
      path = match?.[2]
      continue
    }
    if (path === undefined) continue
    if (line.startsWith('Binary files ')) { binary = true; continue }
    if (line.startsWith('new file mode ')) { before = false; continue }
    if (line.startsWith('deleted file mode ')) { after = false; continue }
    const hunk = HUNK.exec(line)
    if (hunk !== null) {
      current = { oldStart: Number(hunk[1]), oldLines: Number(hunk[2] ?? '1'), newStart: Number(hunk[3]), newLines: Number(hunk[4] ?? '1'), lines: [] }
      hunks.push(current)
      continue
    }
    if (current === undefined || line === '') continue
    if (line.startsWith('+')) { if (!line.startsWith('+++')) added += 1 }
    else if (line.startsWith('-')) { if (!line.startsWith('---')) deleted += 1 }
    else if (line === '\\ No newline at end of file') continue
    current.lines.push(line)
  }
  flushFile()
  return files
}

/** Local branches and checked-out branch of one Git repository. */
export interface RepositoryBranches {
  /** Absolute repository root Git resolved for the requested path. */
  readonly topLevel: string
  /** Checked-out branch, absent for a detached HEAD. */
  readonly current?: string
  /** Local branch names, sorted. */
  readonly branches: readonly string[]
}

/**
 * Read local branches from one repository without changing its worktree.
 * @param repo - Absolute local Git repository path or a directory inside it.
 * @returns resolved root, current branch and sorted local branch names.
 */
export async function repositoryBranches(repo: string): Promise<RepositoryBranches> {
  const topLevel = await localRepository(repo)
  let names: string
  try {
    names = (await execFile('git', ['-C', topLevel, 'for-each-ref', '--format=%(refname:short)', 'refs/heads'], { windowsHide: true })).stdout
  } catch (error) { throw new WorkspacePreparationError('branches_failed', [], error) }
  let current: string | undefined
  try {
    const value = (await execFile('git', ['-C', topLevel, 'symbolic-ref', '--quiet', '--short', 'HEAD'], { windowsHide: true })).stdout.trim()
    if (value !== '') current = value
  } catch { /* A detached HEAD is a valid workspace state and has no branch name. */ }
  const branches = [...new Set(names.split(/\r?\n/u).map(name => name.trim()).filter(name => name !== ''))].sort((a, b) => a.localeCompare(b))
  return { topLevel, ...(current === undefined ? {} : { current }), branches }
}

/**
 * Keep a worktree attached to a real branch, creating one at its current HEAD when detached.
 * @param directory - existing repository worktree.
 * @param branch - branch to create when the worktree is detached.
 * @returns the checked-out branch, which may already differ from the requested one.
 */
export async function ensureWorktreeBranch(directory: string, branch: string): Promise<string> {
  if (!/^(?![-.])[A-Za-z0-9._/-]+$/u.test(branch)) throw new WorkspacePreparationError('invalid_branch')
  let current: string
  try {
    current = (await execFile('git', ['-C', directory, 'symbolic-ref', '--quiet', '--short', 'HEAD'], { windowsHide: true })).stdout.trim()
  } catch (error) {
    if (/not a git repository/iu.test(String((error as { stderr?: string }).stderr))) throw new WorkspacePreparationError('invalid_worktree', [], error)
    current = ''
  }
  if (current !== '') return current
  try {
    await execFile('git', ['-C', directory, 'switch', '-c', branch], { windowsHide: true })
    return branch
  } catch (error) {
    if (/already exists/iu.test(String((error as { stderr?: string }).stderr))) throw new WorkspacePreparationError('branch_exists', [], error)
    throw new WorkspacePreparationError('branch_create_failed', [], error)
  }
}

/** Report whether any worktree has uncommitted or untracked files.
 * @param directories - prepared repository directories.
 * @returns true when Git status reports at least one entry.
 */
export async function workingTreeDirty(directories: readonly string[]): Promise<boolean> {
  for (const directory of directories) {
    try {
      const status = (await execFile('git', ['-C', directory, 'status', '--porcelain=v1', '-z', '--untracked-files=all'], { windowsHide: true })).stdout
      if (status !== '') return true
    } catch (error) { throw new WorkspacePreparationError('diff_failed', [], error) }
  }
  return false
}

/**
 * Read every repository's changes against the Lock baseline.
 * @param worktrees - prepared repository directories and their pinned commits.
 * @returns tracked changes plus untracked files as additions.
 */
export async function workingTreeChanges(worktrees: readonly { repo: string; directory: string; commit: string }[]): Promise<WorkspaceRepositoryChanges[]> {
  const results: WorkspaceRepositoryChanges[] = []
  for (const { repo, directory, commit } of worktrees) {
    if (!COMMIT.test(commit)) throw new WorkspacePreparationError('invalid_commit')
    let tracked: string
    let status: string
    try {
      tracked = (await execFile('git', ['-C', directory, 'diff', '--no-color', '--unified=3', commit], { windowsHide: true })).stdout
      status = (await execFile('git', ['-C', directory, 'status', '--porcelain=v1', '-z', '--untracked-files=all'], { windowsHide: true })).stdout
    } catch (error) { throw new WorkspacePreparationError('diff_failed', [], error) }
    const files = parseDiff(tracked)
    for (const entry of status.split('\u0000')) {
      if (!entry.startsWith('?? ')) continue
      const relative = entry.slice(3)
      let diff = ''
      try {
        diff = (await execFile('git', ['-C', directory, 'diff', '--no-index', '--no-color', '--unified=3', '/dev/null', relative], { windowsHide: true })).stdout
      } catch (error) {
        const output = (error as { stdout?: string }).stdout
        if (typeof output !== 'string') throw new WorkspacePreparationError('diff_failed', [], error)
        diff = output
      }
      files.push(...parseDiff(diff).map(file => ({ ...file, path: relative })))
    }
    results.push({ repo, directory, files })
  }
  return results
}

/**
 * Remove a prepared workspace's worktrees and then its root directory.
 * @param root - Workspace root created by {@link prepareWorkspace}.
 * @param repositories - owning repository and each worktree directory.
 * @returns directories this call failed to remove; empty when cleanup completed.
 */
export async function removeWorkspace(root: string, repositories: readonly { repo: string; directory: string; branch?: string }[]): Promise<string[]> {
  const errors: string[] = []
  for (const { repo, directory, branch } of repositories) {
    try {
      await execFile('git', ['-C', repo, 'worktree', 'remove', '--force', '--', directory], { windowsHide: true })
      if (branch !== undefined) await execFile('git', ['-C', repo, 'branch', '-D', '--', branch], { windowsHide: true })
    } catch { errors.push(directory) }
  }
  try { await rm(root, { recursive: true, force: true }) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') errors.push(root)
  }
  return errors
}

/**
 * Count commits made in a worktree since its Lock baseline.
 * @param directory - prepared worktree.
 * @param baseline - the Lock commit the workspace was created at.
 * @returns the number of commits not present in the Lock.
 */
export async function commitsSince(directory: string, baseline: string): Promise<number> {
  try {
    const result = await execFile('git', ['-C', directory, 'rev-list', '--count', `${baseline}..HEAD`], { windowsHide: true })
    return Number.parseInt(result.stdout.trim(), 10) || 0
  } catch (error) { throw new WorkspacePreparationError('diff_failed', [], error) }
}


/**
 * Aggregate project skill bundles from repositories into a container root.
 * DSH discovers project skills only at the workspace root, so a multi-repository
 * container links each repository's `.dsh/skills` and `.agents/skills` entries
 * under `<root>/.dsh/skills`. Best-effort: one unreadable repository does not
 * fail workspace creation.
 * @param root - Loom-created container root (never a repository worktree).
 * @param repositories - real repository directories inside the container.
 */
export async function linkWorkspaceSkills(root: string, repositories: readonly string[]): Promise<void> {
  const destination = join(root, '.dsh', 'skills')
  let created = false
  for (const repository of repositories) {
    const prefix = basename(repository).replace(/[^A-Za-z0-9._-]/gu, '-')
    for (const relativeRoot of ['.dsh/skills', '.agents/skills'] as const) {
      let entries
      try { entries = await readdir(join(repository, relativeRoot), { withFileTypes: true }) } catch { continue }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        try {
          if (!created) { await mkdir(destination, { recursive: true, mode: 0o700 }); created = true }
          const target = join(repository, relativeRoot, entry.name)
          await symlink(target, join(destination, `${prefix}--${entry.name}`), process.platform === 'win32' ? (entry.isDirectory() ? 'junction' : 'file') : 'dir')
        } catch { /* A skill link is an optional discovery aid; never block the workspace. */ }
      }
    }
  }
}
