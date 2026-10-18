/** Untrusted project configuration admission, without network or filesystem effects. */
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'

/** Repository location and its non-overlapping worktree directory. */
export interface SourceConfig {
  readonly id: Branded<'loom.source'>
  readonly repo: string
  readonly path: string
}
/** Business module within one repository; dot means repository root. */
export interface ModuleConfig {
  readonly id: Branded<'loom.module'>
  readonly sourceId: SourceConfig['id']
  readonly path: string
}
/** Validated project input; version and Lock creation are separate operations. */
export interface ProjectConfig {
  readonly name: string
  readonly sources: readonly SourceConfig[]
  readonly modules: readonly ModuleConfig[]
  /** Agent preset every Session created for this project starts with; omitted means the DSH default. */
  readonly agentPreset?: string
}
/** Structured import failure for localized UI rendering. */
export class ProjectError extends Error {
  constructor(readonly code: 'invalid_object' | 'unknown_field' | 'invalid_string' | 'invalid_path' | 'invalid_list' | 'duplicate_id' | 'unknown_source' | 'overlapping_paths', readonly field: string) {
    super(`${code}: ${field}`)
    this.name = 'ProjectError'
  }
}

function object(value: unknown, fields: readonly string[], at: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ProjectError('invalid_object', at)
  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => !fields.includes(key))) throw new ProjectError('unknown_field', at)
  return record
}
function text(value: unknown, at: string): string {
  if (typeof value !== 'string' || value.trim() === '' || /[\x00-\x1f]/u.test(value)) throw new ProjectError('invalid_string', at)
  return value
}
function relative(value: unknown, at: string, root: boolean): string {
  if (typeof value !== 'string') throw new ProjectError('invalid_path', at)
  if (root && value === '.') return value
  if (value === '' || value.includes('\\') || value.includes(':') || /[\x00-\x1f]/u.test(value)
    || value.split('/').some(part => part === '' || part === '.' || part === '..' || part.toLowerCase() === '.git' || part.trim() !== part)) {
    throw new ProjectError('invalid_path', at)
  }
  return value
}
function list(value: unknown, at: string): unknown[] {
  if (!Array.isArray(value)) throw new ProjectError('invalid_list', at)
  return value
}
function unique(ids: readonly string[], at: string): void {
  if (new Set(ids).size !== ids.length) throw new ProjectError('duplicate_id', at)
}

/** Validate a parsed JSON configuration and return detached data.
 * @param input - Untrusted imported or form-generated value.
 * @returns admitted configuration; no repositories are fetched or scripts executed.
 */
export function parseProject(input: unknown): ProjectConfig {
  const root = object(input, ['name', 'sources', 'modules', 'agentPreset'], 'project')
  const name = text(root.name, 'name')
  const agentPreset = root.agentPreset === undefined ? undefined : text(root.agentPreset, 'agentPreset').trim()
  const sources = list(root.sources, 'sources').map((item, index): SourceConfig => {
    const at = `sources.${index}`
    const source = object(item, ['id', 'repo', 'path'], at)
    return { id: brandString<SourceConfig['id']>(text(source.id, `${at}.id`)), repo: text(source.repo, `${at}.repo`), path: relative(source.path, `${at}.path`, false) }
  })
  if (sources.length === 0) throw new ProjectError('invalid_list', 'sources')
  unique(sources.map(source => source.id), 'sources')
  for (let index = 0; index < sources.length; index++) {
    const path = sources[index]!.path.toLowerCase()
    for (const other of sources.slice(index + 1)) {
      const candidate = other.path.toLowerCase()
      if (path === candidate || path.startsWith(`${candidate}/`) || candidate.startsWith(`${path}/`)) throw new ProjectError('overlapping_paths', 'sources')
    }
  }
  const modules = list(root.modules, 'modules').map((item, index): ModuleConfig => {
    const at = `modules.${index}`
    const module = object(item, ['id', 'sourceId', 'path'], at)
    const sourceId = brandString<SourceConfig['id']>(text(module.sourceId, `${at}.sourceId`))
    if (!sources.some(source => source.id === sourceId)) throw new ProjectError('unknown_source', `${at}.sourceId`)
    return { id: brandString<ModuleConfig['id']>(text(module.id, `${at}.id`)), sourceId, path: relative(module.path, `${at}.path`, true) }
  })
  unique(modules.map(module => module.id), 'modules')
  return { name, sources, modules, ...(agentPreset === undefined ? {} : { agentPreset }) }
}
