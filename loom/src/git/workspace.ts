import { execFile as execFileCallback } from 'node:child_process'
import { lstat, mkdir, rmdir, stat } from 'node:fs/promises'
import { promisify } from 'node:util'
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path'

async function execFile(command: string, args: string[], options: { windowsHide: boolean }) {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'HOME', 'TMPDIR', 'TMP', 'TEMP']) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  env.GIT_CONFIG_NOSYSTEM = '1'
  env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null'
  env.GIT_TERMINAL_PROMPT = '0'
  return promisify(execFileCallback)(command, ['-c', `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`, ...args], { ...options, env })
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
  constructor(readonly code: string, readonly rollbackErrors: readonly string[] = [], cause?: unknown) {
    super(`${code}${rollbackErrors.length === 0 ? '' : `; rollback: ${rollbackErrors.join('; ')}`}`, { cause })
    this.name = 'WorkspacePreparationError'
  }
}

function safeRelativePath(path: string): string {
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
  if (!isAbsolute(repo) || !(await stat(repo).then(value => value.isDirectory()).catch(() => false))) throw new WorkspacePreparationError('local_repository_required')
  try {
    const result = await execFile('git', ['-C', repo, 'rev-parse', '--show-toplevel'], { windowsHide: true })
    const top = resolve(result.stdout.trim())
    if (!(await stat(top)).isDirectory()) throw new Error('not directory')
    return top
  } catch (error) {
    if (error instanceof WorkspacePreparationError) throw error
    throw new WorkspacePreparationError('invalid_repository', [], error)
  }
}

/** Resolve one local repository ref to an exact commit using argument-safe Git invocation.
 * @param repo - Absolute local Git repository path.
 * @param ref - Ref expression accepted by Git's commit verifier.
 * @returns the full SHA-1 or SHA-256 commit id.
 */
export async function resolveCommit(repo: string, ref: string): Promise<string> {
  const top = await localRepository(repo)
  if (ref.startsWith('-')) throw new WorkspacePreparationError('invalid_ref')
  try {
    const result = await execFile('git', ['-C', top, 'rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], { windowsHide: true })
    const commit = result.stdout.trim()
    if (!COMMIT.test(commit)) throw new WorkspacePreparationError('invalid_commit')
    return commit
  } catch (error) {
    if (error instanceof WorkspacePreparationError) throw error
    throw new WorkspacePreparationError('invalid_commit', [], error)
  }
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

/** Create a task-owned root and detached worktrees; rollback only this call's creations on failure.
 * @param root - New absolute workspace root; it must not already exist.
 * @param repositories - Local repositories and exact commits to materialize.
 * @returns created root and worktree paths.
 */
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
    if (!inside(rootPath, target) || [...seen].some(other => other.toLowerCase() === target.toLowerCase() || inside(other.toLowerCase(), target.toLowerCase()) || inside(target.toLowerCase(), other.toLowerCase()))) throw new WorkspacePreparationError('overlapping_paths')
    seen.add(target)
    if (await exists(target)) throw new WorkspacePreparationError('existing_target')
    if (request.branch !== undefined && !/^(?![-.])[A-Za-z0-9._/-]+$/u.test(request.branch)) throw new WorkspacePreparationError('invalid_branch')
    prepared.push({ repo, target, branch: request.branch })
  }
  if (await exists(rootPath)) throw new WorkspacePreparationError('existing_root')
  const created: { target: string; repo: string; branch: string | undefined }[] = []
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
      const args = request.branch === undefined
        ? ['-C', repo, 'worktree', 'add', '--detach', '--', target, request.commit]
        : ['-C', repo, 'worktree', 'add', '-b', request.branch, '--', target, request.commit]
      await execFile('git', args, { windowsHide: true })
      created.push({ target, repo, branch: request.branch })
    }
    return { root: rootPath, worktrees: created.map(item => item.target) }
  } catch (error) {
    const rollbackErrors: string[] = []
    for (const { target, repo, branch } of [...created].reverse()) {
      try {
        await execFile('git', ['-C', repo, 'worktree', 'remove', '--', target], { windowsHide: true })
        if (branch !== undefined) await execFile('git', ['-C', repo, 'branch', '-D', '--', branch], { windowsHide: true })
      } catch (rollback) { rollbackErrors.push(`remove ${target}: ${String(rollback)}`) }
    }
    for (const directory of [...createdDirs].reverse()) {
      try { await rmdir(directory) }
      catch (rollback) {
        if ((rollback as NodeJS.ErrnoException).code !== 'ENOENT') rollbackErrors.push(`remove directory ${directory}: ${String(rollback)}`)
      }
    }
    if (error instanceof WorkspacePreparationError) throw new WorkspacePreparationError(error.code, rollbackErrors, error)
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
  try { await rmdir(root, { recursive: true }) } catch (error) {
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
