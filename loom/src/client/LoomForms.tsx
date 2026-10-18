/** Inline creation and edit forms for Loom projects, versions and tasks. */
import { useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CreateTaskRequest, CreateVersionRequest, GenerateLockRequest, Lock, ModuleConfig,
  ProjectConfig, ProjectRecord, SourceConfig, TaskRecord, TaskPriority, VersionRecord,
  UpdateProjectRequest, UpdateTaskRequest, UpdateVersionRequest,
} from 'dsh-workloom/types'
import { parseProject, ProjectError } from '../domain/project.ts'
import { COLORS, failureKey } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

const button: CSSProperties = { color: 'inherit', background: 'transparent', border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', font: 'inherit' }
const box: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)' }
const input: CSSProperties = { ...button, cursor: 'text', width: '100%', boxSizing: 'border-box' }
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const fieldLabel: CSSProperties = { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }
const alert: CSSProperties = { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }
const failureCode: CSSProperties = { display: 'block', marginTop: 4, color: 'var(--dsw-alias-label-error)', fontFamily: 'ui-monospace, monospace', fontSize: 11, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }

function FailureNotice({ failure, t }: { failure: string; t: Translate }) {
  const key = failureKey(failure)
  return <div role="alert" style={alert}>
    <p style={{ margin: 0 }}>{key === undefined ? t('state.error') : t(key)}</p>
    <code style={failureCode}>{failure}</code>
  </div>
}

/** One repository row of the project form. */
export interface SourceDraft {
  readonly id?: SourceConfig['id']
  readonly repo: string
  readonly path: string
}

/** One business module row; the repository choice names a derived source id. */
export interface ModuleDraft {
  readonly id?: ModuleConfig['id']
  readonly source: string
  readonly path: string
}

/**
 * Start a repository row empty so the form never silently submits placeholder ids or directories.
 * @returns a blank repository row.
 */
export function emptySourceRow(): SourceDraft {
  return { repo: '', path: '' }
}

/**
 * Start a module row empty.
 * @returns a blank module row.
 */
export function emptyModuleRow(): ModuleDraft {
  return { source: '', path: '' }
}

function segment(value: string): string {
  return value.split('/').map(part => part.trim()).filter(part => part !== '' && part !== '.').at(-1) ?? ''
}

function slug(value: string): string {
  return segment(value).replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '').toLowerCase()
}

function uniqueId(base: string, used: Set<string>): string {
  let candidate = base
  let index = 2
  while (used.has(candidate)) { candidate = `${base}-${index}`; index += 1 }
  used.add(candidate)
  return candidate
}

/**
 * Derive one stable repository id per row from its workspace directory.
 * Users never type these ids; versions and Locks reference them internally.
 * @param sources - Repository rows in submission order.
 * @returns ids in the same order, disambiguated by a numeric suffix.
 */
export function sourceIds(sources: readonly SourceDraft[]): string[] {
  const used = new Set<string>()
  return sources.map((source) => {
    if (source.id !== undefined && !used.has(source.id)) { used.add(source.id); return source.id }
    return uniqueId(slug(source.path) || slug(source.repo) || 'repo', used)
  })
}

function moduleIds(modules: readonly ModuleDraft[], ids: readonly string[]): string[] {
  const used = new Set<string>()
  return modules.map((module) => {
    if (module.id !== undefined && !used.has(module.id)) { used.add(module.id); return module.id }
    const sourceId = ids[ids.indexOf(module.source)] ?? 'module'
    return uniqueId(slug(module.path) === '' ? `${sourceId}-root` : slug(module.path), used)
  })
}

/**
 * Validate the project form and derive repository and module ids.
 * @param name - Admitted project name.
 * @param sources - Repository rows in submission order.
 * @param modules - Optional business module rows.
 * @returns detached request, or undefined while a required field is blank.
 */
export function projectRequest(name: string, sources: readonly SourceDraft[], modules: readonly ModuleDraft[]): ProjectConfig | undefined {
  const admittedName = name.trim()
  if (admittedName === '' || sources.length === 0) return undefined
  const rows = sources.map(source => ({ ...(source.id === undefined ? {} : { id: source.id }), repo: source.repo.trim(), path: source.path.trim() }))
  if (rows.some(source => source.repo === '' || source.path === '')) return undefined
  const ids = sourceIds(rows)
  const admittedSources = rows.map((source, index) => ({
    id: ids[index] as SourceConfig['id'],
    repo: source.repo,
    path: source.path,
  }))
  const paths = new Set<string>()
  for (const source of admittedSources) {
    const path = source.path.toLowerCase()
    if ([...paths].some(other => path === other || path.startsWith(`${other}/`) || other.startsWith(`${path}/`))) return undefined
    paths.add(path)
  }
  const draftedModules = modules.filter(module => module.source !== '' || module.path.trim() !== '')
  if (draftedModules.some(module => module.source === '' || !ids.includes(module.source) || module.path.trim() === '')) return undefined
  const moduleIdList = moduleIds(draftedModules, ids)
  const admittedModules = draftedModules.map((module, index) => ({
    id: moduleIdList[index] as ModuleConfig['id'],
    sourceId: module.source as SourceConfig['id'],
    path: module.path.trim(),
  }))
  return { name: admittedName, sources: admittedSources, modules: admittedModules }
}

/**
 * Validate the version form against the selected project's repositories.
 * @param project - Project whose repository ids name the version sources.
 * @param name - Admitted version name.
 * @param refs - Ref text keyed by repository id.
 * @returns detached request, or undefined while an input is blank.
 */
export function versionRequest(project: ProjectRecord, name: string, refs: Readonly<Record<string, string>>): CreateVersionRequest | undefined {
  const admittedName = name.trim()
  if (admittedName === '') return undefined
  const sources = project.config.sources.map(source => ({ sourceId: source.id, ref: (refs[source.id] ?? '').trim() }))
  if (sources.some(source => source.ref === '')) return undefined
  return { projectId: project.id, name: admittedName, sources }
}

/** Optional task metadata admitted by the create form. */
export interface TaskMetadataDraft {
  readonly description: string
  readonly priority: TaskPriority
  readonly moduleIds: readonly string[]
}

/**
 * Validate the task form.
 * @param version - Version that owns the new task.
 * @param title - Admitted task title.
 * @param metadata - Optional description, priority and business modules.
 * @returns detached request, or undefined for a blank title.
 */
export function taskRequest(version: VersionRecord, title: string, metadata?: TaskMetadataDraft): CreateTaskRequest | undefined {
  const admitted = title.trim()
  if (admitted === '') return undefined
  const description = metadata?.description.trim() ?? ''
  const priority = metadata?.priority ?? 'normal'
  const moduleIds = metadata?.moduleIds ?? []
  return {
    versionId: version.id,
    title: admitted,
    ...(description === '' ? {} : { description }),
    ...(priority === 'normal' ? {} : { priority }),
    ...(moduleIds.length === 0 ? {} : { moduleIds }),
  }
}

interface ProjectFormProps {
  t: Translate
  create(request: ProjectConfig): Promise<RemoteResult<ProjectRecord>>
  update?(request: UpdateProjectRequest): Promise<RemoteResult<ProjectRecord>>
  project?: ProjectRecord
  onCreated(project: ProjectRecord): void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type ProjectStep = 'basics' | 'modules' | 'preview'

/** Create or edit one project with its repositories, optional modules and a preview before saving. */
export function ProjectForm({ t, create, update, project, onCreated, open: controlledOpen, onOpenChange }: ProjectFormProps) {
  const editing = project !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (value: boolean): void => { setInternalOpen(value); onOpenChange?.(value) }
  const [step, setStep] = useState<ProjectStep>('basics')
  const [name, setName] = useState(project?.config.name ?? '')
  const [sources, setSources] = useState<SourceDraft[]>(project === undefined ? [emptySourceRow()] : project.config.sources.map(source => ({ id: source.id, repo: source.repo, path: source.path })))
  const [modules, setModules] = useState<ModuleDraft[]>(project === undefined ? [] : project.config.modules.map(module => ({ id: module.id, source: module.sourceId, path: module.path })))
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  if (!open) return editing ? null : <button style={button} onClick={() => setOpen(true)}>{t('project.new')}</button>
  const ids = sourceIds(sources)
  const request = projectRequest(name, sources, modules)
  function reset(): void {
    if (editing) { setOpen(false); setFailure(undefined); return }
    setName(''); setSources([emptySourceRow()]); setModules([]); setStep('basics'); setOpen(false); setFailure(undefined)
  }
  function updateSource(index: number, patch: Partial<SourceDraft>): void {
    setSources(current => current.map((source, at) => at === index ? { ...source, ...patch } : source))
  }
  function updateModule(index: number, patch: Partial<ModuleDraft>): void {
    setModules(current => current.map((module, at) => at === index ? { ...module, ...patch } : module))
  }
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (step !== 'preview') { setStep(step === 'basics' ? 'modules' : 'preview'); return }
    if (request === undefined) { setFailure('invalid_form'); return }
    setBusy(true); setFailure(undefined)
    try {
      const result = editing
        ? update === undefined ? undefined : await update({ projectId: project.id, config: request })
        : await create(request)
      if (result === undefined || !result.ok) { setFailure(result === undefined ? t('state.error') : result.error.message); return }
      reset(); onCreated(result.value)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }
  return <form style={box} onSubmit={event => { void submit(event) }}>
    <div style={{ display: 'flex', gap: 6, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }}>
      <span>{t('project.name')}</span><span>→</span><span>{t('source.title')}</span><span>→</span><span>{t('module.title')}</span><span>→</span><span>{t('project.preview')}</span>
    </div>
    {step === 'basics' && <>
      <label style={field}><span style={fieldLabel}>{t('project.name')}</span>
        <input aria-label={t('project.name')} placeholder={t('project.name')} value={name} onChange={event => setName(event.target.value)} style={input} />
      </label>
      {sources.map((source, index) => <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={field}><span style={fieldLabel}>{t('source.repo')}</span>
          <input aria-label={t('source.repo')} placeholder={t('source.repo')} value={source.repo} onChange={event => updateSource(index, { repo: event.target.value })} style={input} />
        </label>
        <label style={field}><span style={fieldLabel}>{t('source.path')}</span>
          <input aria-label={t('source.path')} placeholder={t('source.path')} value={source.path} onChange={event => updateSource(index, { path: event.target.value })} style={input} />
        </label>
        {sources.length > 1 && <button type="button" style={button} onClick={() => setSources(current => current.filter((_source, at) => at !== index))}>{t('source.remove')}</button>}
      </div>)}
      <div><button type="button" style={button} onClick={() => setSources(current => [...current, emptySourceRow()])}>{t('source.add')}</button></div>
    </>}
    {step === 'modules' && <>
      <p style={{ ...fieldLabel, margin: 0 }}>{t('module.optional')}</p>
      {modules.map((module, index) => <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={field}><span style={fieldLabel}>{t('module.source')}</span>
          <select aria-label={t('module.source')} value={module.source} onChange={event => updateModule(index, { source: event.target.value })} style={input}>
            <option value="">{t('module.source')}</option>
            {sources.map((source, at) => <option key={at} value={ids[at]}>{source.path}</option>)}
          </select>
        </label>
        <label style={field}><span style={fieldLabel}>{t('module.path')}</span>
          <input aria-label={t('module.path')} placeholder={t('module.path')} value={module.path} onChange={event => updateModule(index, { path: event.target.value })} style={input} />
        </label>
        <button type="button" style={button} onClick={() => setModules(current => current.filter((_module, at) => at !== index))}>{t('module.remove')}</button>
      </div>)}
      <div><button type="button" style={button} onClick={() => setModules(current => [...current, emptyModuleRow()])}>{t('module.add')}</button></div>
    </>}
    {step === 'preview' && <>
      <p style={{ ...fieldLabel, margin: 0 }}>{t('project.previewHint')}</p>
      <pre style={{ margin: 0, overflow: 'auto', maxHeight: 220, fontSize: 11, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary)' }}>{JSON.stringify(request ?? null, undefined, 2)}</pre>
    </>}
    {failure !== undefined && <FailureNotice failure={failure} t={t} />}
    <div style={{ display: 'flex', gap: 8 }}>
      {step === 'basics' && <button type="submit" style={button} disabled={name.trim() === ''}>{t('form.next')}</button>}
      {step === 'modules' && <button type="submit" style={button} disabled={request === undefined}>{t('form.next')}</button>}
      {step !== 'basics' && <button type="button" style={button} onClick={() => setStep(step === 'preview' ? 'modules' : 'basics')}>{t('form.back')}</button>}
      {step === 'preview' && <button type="submit" style={button} disabled={busy || request === undefined}>{busy ? t('form.submitPending') : editing ? t('form.save') : t('form.confirm')}</button>}
      <button type="button" style={button} onClick={reset}>{t('form.cancel')}</button>
    </div>
  </form>
}

interface VersionFormProps {
  t: Translate
  project: ProjectRecord
  create(request: CreateVersionRequest): Promise<RemoteResult<VersionRecord>>
  update?(request: UpdateVersionRequest): Promise<RemoteResult<VersionRecord>>
  version?: VersionRecord
  onCreated(version: VersionRecord): void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** Create or edit one version with a ref per project repository; Lock generation stays separate. */
export function VersionForm({ t, project, create, update, version, onCreated, open: controlledOpen, onOpenChange }: VersionFormProps) {
  const editing = version !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (value: boolean): void => { setInternalOpen(value); onOpenChange?.(value) }
  const [name, setName] = useState(version?.name ?? '')
  const [refs, setRefs] = useState<Record<string, string>>(version === undefined ? {} : Object.fromEntries(version.sources.map(source => [source.sourceId, source.ref])))
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  if (!open) return editing ? null : <button style={button} onClick={() => setOpen(true)}>{t('version.new')}</button>
  function close(): void { setOpen(false); setFailure(undefined) }
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const request = versionRequest(project, name, refs)
    if (request === undefined) { setFailure('invalid_form'); return }
    setBusy(true); setFailure(undefined)
    try {
      const result = editing
        ? update === undefined ? undefined : await update({ versionId: version.id, name: request.name, sources: request.sources })
        : await create(request)
      if (result === undefined || !result.ok) { setFailure(result === undefined ? t('state.error') : result.error.message); return }
      if (!editing) { setName(''); setRefs({}) }
      close(); onCreated(result.value)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }
  return <form style={box} onSubmit={event => { void submit(event) }}>
    <input aria-label={t('version.name')} placeholder={t('version.name')} value={name} onChange={event => setName(event.target.value)} style={input} />
    {project.config.sources.map(source => <input key={source.id} aria-label={`${t('source.ref')} ${source.id}`} placeholder={`${source.id}: ${t('source.ref')}`}
      value={refs[source.id] ?? ''} onChange={event => setRefs(current => ({ ...current, [source.id]: event.target.value }))} style={input} />)}
    {failure !== undefined && <FailureNotice failure={failure} t={t} />}
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="submit" style={button} disabled={busy}>{busy ? t('form.submitPending') : editing ? t('form.save') : t('form.create')}</button>
      <button type="button" style={button} onClick={close}>{t('form.cancel')}</button>
    </div>
  </form>
}

interface TaskFormProps {
  t: Translate
  version: VersionRecord
  project: ProjectRecord
  create(request: CreateTaskRequest): Promise<RemoteResult<TaskRecord>>
  update?(request: UpdateTaskRequest): Promise<RemoteResult<TaskRecord>>
  task?: TaskRecord
  onCreated(task: TaskRecord): void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** Create or edit one task under the selected version. */
export function TaskForm({ t, version, project, create, update, task, onCreated, open: controlledOpen, onOpenChange }: TaskFormProps) {
  const editing = task !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (value: boolean): void => { setInternalOpen(value); onOpenChange?.(value) }
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'normal')
  const [moduleIds, setModuleIds] = useState<string[]>([...(task?.moduleIds ?? [])])
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  if (!open) return editing ? null : <button style={button} onClick={() => setOpen(true)}>{t('task.new')}</button>
  function close(): void { setOpen(false); setFailure(undefined) }
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const request = taskRequest(version, title, { description, priority, moduleIds })
    if (request === undefined) { setFailure('invalid_form'); return }
    setBusy(true); setFailure(undefined)
    try {
      const result = editing
        ? update === undefined ? undefined : await update({
          taskId: task.id,
          title: request.title,
          ...(request.description === undefined ? {} : { description: request.description }),
          ...(request.moduleIds === undefined ? {} : { moduleIds: request.moduleIds }),
          ...(request.priority === undefined ? {} : { priority: request.priority }),
        })
        : await create(request)
      if (result === undefined || !result.ok) { setFailure(result === undefined ? t('state.error') : result.error.message); return }
      if (!editing) { setTitle(''); setDescription(''); setPriority('normal'); setModuleIds([]) }
      close(); onCreated(result.value)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }
  return <form style={box} onSubmit={event => { void submit(event) }}>
    <label style={field}><span style={fieldLabel}>{t('task.name')}</span>
      <input aria-label={t('task.name')} placeholder={t('task.name')} value={title} onChange={event => setTitle(event.target.value)} style={input} />
    </label>
    <label style={field}><span style={fieldLabel}>{t('task.description')}</span>
      <textarea aria-label={t('task.description')} placeholder={t('task.description')} value={description} maxLength={4000} rows={4} onChange={event => setDescription(event.target.value)} style={{ ...input, resize: 'vertical', font: 'inherit' }} />
    </label>
    <label style={field}><span style={fieldLabel}>{t('task.priority')}</span>
      <select aria-label={t('task.priority')} value={priority} onChange={event => setPriority(event.target.value as TaskPriority)} style={input}>
        <option value="low">{t('task.priority.low')}</option>
        <option value="normal">{t('task.priority.normal')}</option>
        <option value="high">{t('task.priority.high')}</option>
      </select>
    </label>
    <div style={field}>
      <span style={fieldLabel}>{t('task.modules')}</span>
      {project.config.modules.length === 0 && <p style={alert}>{t('task.noModules')}</p>}
      {project.config.modules.map(module => <label key={module.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
        <input type="checkbox" checked={moduleIds.includes(module.id)} onChange={event => setModuleIds(current => event.target.checked ? [...current, module.id] : current.filter(id => id !== module.id))} />
        <span>{module.path}</span>
      </label>)}
    </div>
    {failure !== undefined && <FailureNotice failure={failure} t={t} />}
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="submit" style={button} disabled={busy}>{busy ? t('form.submitPending') : editing ? t('form.save') : t('form.create')}</button>
      <button type="button" style={button} onClick={close}>{t('form.cancel')}</button>
    </div>
  </form>
}

/** One imported project file's admitted configuration or a structured rejection. */
export type ImportProjectResult =
  | { readonly ok: true; readonly config: ProjectConfig }
  | { readonly ok: false; readonly reason: 'json' | 'invalid'; readonly field?: string }

/**
 * Parse an imported JSON document through the same admission rules as manual creation.
 * @param text - File contents; no repository is fetched and no script runs.
 * @returns normalized project configuration or a JSON/field rejection.
 */
export function parseImport(text: string): ImportProjectResult {
  let value: unknown
  try { value = JSON.parse(text) } catch { return { ok: false, reason: 'json' } }
  try { return { ok: true, config: parseProject(value) } }
  catch (error) {
    if (error instanceof ProjectError) return { ok: false, reason: 'invalid', field: error.field }
    throw error
  }
}

interface ImportProjectFormProps {
  t: Translate
  create(request: ProjectConfig): Promise<RemoteResult<ProjectRecord>>
  onCreated(project: ProjectRecord): void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** Validate a JSON project file, preview repositories and modules, then save it explicitly. */
export function ImportProjectForm({ t, create, onCreated, open: controlledOpen, onOpenChange }: ImportProjectFormProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (value: boolean): void => { setInternalOpen(value); onOpenChange?.(value) }
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<ImportProjectResult>()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!open) return <button style={button} onClick={() => setOpen(true)}>{t('project.import')}</button>
  async function choose(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (file === undefined) return
    setFileName(file.name); setFailed(false)
    setResult(parseImport(await file.text()))
  }
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (result?.ok !== true) { setFailed(true); return }
    setBusy(true); setFailed(false)
    try {
      const created = await create(result.config)
      if (!created.ok) { setFailed(true); return }
      setBusy(false); setResult(undefined); setFileName(''); setOpen(false); onCreated(created.value)
    } catch { setFailed(true); setBusy(false) }
  }
  return <form style={box} onSubmit={event => { void submit(event) }}>
    <label style={field}><span style={fieldLabel}>{t('project.importFile')}</span>
      <input aria-label={t('project.importFile')} type="file" accept=".json,application/json" onChange={event => { void choose(event) }} style={input} />
    </label>
    {fileName !== '' && <p style={alert}>{fileName}</p>}
    {result?.ok === false && <p role="alert" style={alert}>{result.reason === 'json' ? t('project.importJsonInvalid') : `${t('project.importInvalid')}${result.field === undefined ? '' : ` (${result.field})`}`}</p>}
    {result?.ok === true && <>
      <p style={fieldLabel}>{t('project.importHint')}</p>
      <div style={field}><span style={fieldLabel}>{t('project.name')}</span><span>{result.config.name}</span></div>
      <div style={field}><span style={fieldLabel}>{t('project.importSources')}</span>
        {result.config.sources.map(source => <div key={source.id} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
          <span style={{ color: COLORS.cyan }}>{source.id}</span><span>{source.repo}</span><span style={{ color: COLORS.dim }}>→ {source.path}</span>
        </div>)}
      </div>
      <div style={field}><span style={fieldLabel}>{t('project.importModules')}</span>
        {result.config.modules.length === 0 && <span style={alert}>{t('module.optional')}</span>}
        {result.config.modules.map(module => <div key={module.id} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
          <span style={{ color: COLORS.cyan }}>{module.id}</span><span>{module.sourceId} / {module.path}</span>
        </div>)}
      </div>
    </>}
    {failed && <FailureNotice failure={t('state.error')} t={t} />}
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="submit" style={button} disabled={busy || result?.ok !== true}>{busy ? t('form.submitPending') : t('project.importConfirm')}</button>
      <button type="button" style={button} onClick={() => { setOpen(false); setResult(undefined); setFileName(''); setFailed(false) }}>{t('form.cancel')}</button>
    </div>
  </form>
}

interface LockButtonProps {
  t: Translate
  version: VersionRecord
  generate(request: GenerateLockRequest): Promise<RemoteResult<Lock>>
  onCreated(): void
}

/** Pin every repository ref of the selected version into a new immutable Lock. */
export function LockButton({ t, version, generate, onCreated }: LockButtonProps) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  async function run(): Promise<void> {
    setBusy(true); setFailure(undefined)
    try {
      const result = await generate({ versionId: version.id })
      if (!result.ok) { setFailure(result.error.message); return }
      onCreated()
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }
  return <div style={{ marginTop: 8 }}>
    <button style={button} disabled={busy} onClick={() => { void run() }}>{busy ? t('lock.resolving') : t('lock.new')}</button>
    {failure !== undefined && <FailureNotice failure={failure} t={t} />}
  </div>
}
