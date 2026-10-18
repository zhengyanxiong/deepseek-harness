/** Deterministic Git branch names for Loom-owned repository worktrees. */

function segment(value: string, fallback: string): string {
  const normalized = value.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/\.{2,}/gu, '.').replace(/^[._-]+|[._-]+$/gu, '').slice(0, 32)
  return normalized === '' || normalized.endsWith('.lock') ? fallback : normalized
}

/**
 * Name a workspace branch from its version, repository source and workspace identity.
 * @param versionName - Human version name used as the branch namespace.
 * @param workspaceId - Workspace identity; only a short suffix appears in the name.
 * @param sourceId - Repository source identity distinguishing branches of one workspace.
 * @returns a valid, stable branch name such as `loom/v1/web-1a2b3c4d`.
 */
export function workspaceBranchName(versionName: string, workspaceId: string, sourceId: string): string {
  const id = workspaceId.replace(/[^A-Za-z0-9]/gu, '').slice(0, 8) || 'workspace'
  return `loom/${segment(versionName, 'version')}/${segment(sourceId, 'source')}-${id}`
}
