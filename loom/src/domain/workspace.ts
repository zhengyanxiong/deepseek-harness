/** Workspace layouts that keep DSH's single working directory while supporting one or many repositories. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import { isAbsolute, normalize } from 'node:path'

/** How the workspace root and repository directories were created. */
export type WorkspaceMode = 'managed' | 'direct' | 'linked'

/** How one repository is exposed below the workspace root. */
export type WorkspaceRepositoryKind = 'worktree' | 'direct' | 'link'

/** One repository's logical path and its real physical directory. */
export interface WorkspaceRepositoryBinding {
  readonly sourceId: Branded<'loom.source'>
  /** Path below the workspace root; `.` is valid only for a single direct repository. */
  readonly path: string
  /** Real directory Git operates on. */
  readonly targetPath: string
  readonly kind: WorkspaceRepositoryKind
  readonly branch?: string | undefined
}

/** Complete workspace layout before it is persisted. */
export interface WorkspaceLayout {
  readonly projectId: Branded<'loom.project'>
  readonly mode: WorkspaceMode
  readonly rootPath: string
  readonly rootOwner: 'loom' | 'user'
  readonly repositories: readonly WorkspaceRepositoryBinding[]
}

/** Stable layout rejection codes for localized Host/Client messages. */
export type WorkspaceLayoutErrorCode = 'invalid_root' | 'empty_repositories' | 'duplicate_source'
  | 'invalid_path' | 'invalid_target' | 'overlapping_paths' | 'invalid_kind'

/** Rejected layout without filesystem effects. */
export class WorkspaceLayoutError extends Error {
  constructor(readonly code: WorkspaceLayoutErrorCode) {
    super(code)
    this.name = 'WorkspaceLayoutError'
  }
}

function absolute(value: string): boolean {
  if (value === '') return false
  if (isAbsolute(value)) return normalize(value) === value
  // Persisted layouts may come from a catalog written on another operating system.
  return /^[A-Za-z]:[\\/]/u.test(value) || /^\\\\/u.test(value)
}

function relative(value: string): boolean {
  if (value === '.') return true
  if (value === '' || value.includes('\\') || value.includes(':') || /[\x00-\x1f]/u.test(value)) return false
  return value.split('/').every(part => part !== '' && part !== '.' && part !== '..' && part.trim() === part && part.toLowerCase() !== '.git')
}

/** Validate one layout's paths and repository roles without touching the filesystem.
 * @param layout - Candidate layout from a Host request or migration.
 * @returns nothing when the layout is internally consistent.
 */
export function admitWorkspaceLayout(layout: WorkspaceLayout): void {
  if (!absolute(layout.rootPath)) throw new WorkspaceLayoutError('invalid_root')
  if (layout.repositories.length === 0) throw new WorkspaceLayoutError('empty_repositories')
  const sources = new Set<string>()
  const paths = new Set<string>()
  for (const repository of layout.repositories) {
    if (sources.has(repository.sourceId)) throw new WorkspaceLayoutError('duplicate_source')
    sources.add(repository.sourceId)
    if (!relative(repository.path)) throw new WorkspaceLayoutError('invalid_path')
    if (!absolute(repository.targetPath)) throw new WorkspaceLayoutError('invalid_target')
    if (repository.kind !== 'worktree' && repository.kind !== 'direct' && repository.kind !== 'link') throw new WorkspaceLayoutError('invalid_kind')
    const key = repository.path.toLowerCase()
    if (paths.has(key)) throw new WorkspaceLayoutError('overlapping_paths')
    for (const other of paths) {
      if (key.startsWith(`${other}/`) || other.startsWith(`${key}/`)) throw new WorkspaceLayoutError('overlapping_paths')
    }
    paths.add(key)
  }
  const singleRoot = layout.repositories.length === 1 && layout.repositories[0]!.path === '.'
  if (layout.repositories.some(repository => repository.path === '.') && !singleRoot) throw new WorkspaceLayoutError('overlapping_paths')
  if (layout.mode === 'managed' && layout.repositories.some(repository => repository.kind !== 'worktree')) throw new WorkspaceLayoutError('invalid_kind')
  if (layout.mode === 'linked' && layout.repositories.some(repository => repository.kind !== 'link')) throw new WorkspaceLayoutError('invalid_kind')
  if (layout.mode === 'linked' && layout.repositories.some(repository => repository.path === '.')) throw new WorkspaceLayoutError('invalid_path')
  if (layout.mode === 'direct' && layout.repositories.some(repository => repository.kind !== 'direct')) throw new WorkspaceLayoutError('invalid_kind')
}
