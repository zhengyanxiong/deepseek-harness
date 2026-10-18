/** Version refs and immutable multi-repository Lock resolution. */
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import type { ProjectConfig, SourceConfig } from './project.ts'

/** Version configuration before refs resolve to commits. */
export interface VersionConfig {
  readonly id: string
  readonly sources: readonly { readonly sourceId: SourceConfig['id']; readonly ref: string }[]
}
/** Resolved exact repository baseline. */
export interface ResolvedLock {
  readonly id: Branded<'loom.lock'>
  readonly versionId: Branded<'loom.version'>
  readonly repositories: readonly { readonly sourceId: SourceConfig['id']; readonly commit: string }[]
}
/** Resolve one configured ref per repository; the callback performs Git I/O. */
export async function resolveLock(
  project: ProjectConfig,
  version: VersionConfig,
  lockId: string,
  resolveCommit: (repo: string, ref: string) => Promise<string>,
): Promise<ResolvedLock> {
  const projectSources = project.sources.map(source => Object.freeze({ ...source }))
  const versionId = version.id
  const versionSources = version.sources.map(entry => Object.freeze({ ...entry }))
  if (versionSources.length === 0) throw new Error('empty_version')
  const sourceById = new Map(projectSources.map(source => [source.id, source]))
  const seen = new Set<string>()
  const selected: { source: SourceConfig; ref: string }[] = []
  for (const entry of versionSources) {
    if (seen.has(entry.sourceId)) throw new Error(`duplicate_source: ${entry.sourceId}`)
    seen.add(entry.sourceId)
    const source = sourceById.get(entry.sourceId)
    if (source === undefined) throw new Error(`unknown_source: ${entry.sourceId}`)
    selected.push({ source, ref: entry.ref })
  }
  const repositories = []
  for (const { source, ref } of selected) {
    const commit = await resolveCommit(source.repo, ref)
    if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(commit)) throw new Error(`invalid_commit: ${source.id}`)
    repositories.push(Object.freeze({ sourceId: source.id, commit }))
  }
  return Object.freeze({
    id: brandString<ResolvedLock['id']>(lockId),
    versionId: brandString<ResolvedLock['versionId']>(versionId),
    repositories: Object.freeze(repositories),
  })
}
