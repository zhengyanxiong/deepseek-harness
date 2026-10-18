/** Inline creation forms for Loom projects, versions and tasks. */
import { useState, type CSSProperties, type FormEvent } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CreateTaskRequest, CreateVersionRequest, GenerateLockRequest, Lock,
  ProjectConfig, ProjectRecord, SourceConfig, TaskRecord, VersionRecord,
} from 'dsh-loom/types'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

const button: CSSProperties = { color: 'inherit', background: 'transparent', border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', font: 'inherit' }
const box: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)' }
const input: CSSProperties = { ...button, cursor: 'text', width: '100%', boxSizing: 'border-box' }
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const fieldLabel: CSSProperties = { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }
const alert: CSSProperties = { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }

/** One repository row of the project form. */
export interface SourceDraft {
  readonly id: string
  readonly repo: string
  readonly path: string
}

/**
 * Start a repository row empty so the form never silently submits placeholder ids or directories.
 * @returns a blank repository row.
 */
export function emptySourceRow(): SourceDraft {
  return { id: '', repo: '', path: '' }
}

/**
 * Validate the project form.
 * @param name - Admitted project name.
 * @param sources - Repository rows in submission order.
 * @returns detached request, or undefined while a required field is blank.
 */
export function projectRequest(name: string, sources: readonly SourceDraft[]): ProjectConfig | undefined {
  const admittedName = name.trim()
  if (admittedName === '' || sources.length === 0) return undefined
  const admitted = sources.map(source => ({ id: source.id.trim(), repo: source.repo.trim(), path: source.path.trim() }))
  if (admitted.some(source => source.id === '' || source.repo === '' || source.path === '')) return undefined
  return {
    name: admittedName,
    sources: admitted.map(source => ({ id: source.id as SourceConfig['id'], repo: source.repo, path: source.path })),
    modules: [],
  }
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

/**
 * Validate the task form.
 * @param version - Version that owns the new task.
 * @param title - Admitted task title.
 * @returns detached request, or undefined for a blank title.
 */
export function taskRequest(version: VersionRecord, title: string): CreateTaskRequest | undefined {
  const admitted = title.trim()
  return admitted === '' ? undefined : { versionId: version.id, title: admitted }
}

interface ProjectFormProps {
  t: Translate
  create(request: ProjectConfig): Promise<RemoteResult<ProjectRecord>>
  onCreated(): void
}

/** Create one project with its repository rows; the Host admits the configuration. */
export function ProjectForm({ t, create, onCreated }: ProjectFormProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [sources, setSources] = useState<SourceDraft[]>([emptySourceRow()])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!open) return <button style={button} onClick={() => setOpen(true)}>{t('project.new')}</button>
  function update(index: number, patch: Partial<SourceDraft>): void {
    setSources(current => current.map((source, at) => at === index ? { ...source, ...patch } : source))
  }
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const request = projectRequest(name, sources)
    if (request === undefined) { setFailed(true); return }
    setBusy(true); setFailed(false)
    try {
      const result = await create(request)
      if (!result.ok) { setFailed(true); return }
      setName(''); setSources([emptySourceRow()]); setOpen(false); onCreated()
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  return <form style={box} onSubmit={event => { void submit(event) }}>
    <input aria-label={t('project.name')} placeholder={t('project.name')} value={name} onChange={event => setName(event.target.value)} style={input} />
    {sources.map((source, index) => <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={field}><span style={fieldLabel}>{t('source.id')}</span>
        <input aria-label={t('source.id')} placeholder={t('source.id')} value={source.id} onChange={event => update(index, { id: event.target.value })} style={input} />
      </label>
      <label style={field}><span style={fieldLabel}>{t('source.repo')}</span>
        <input aria-label={t('source.repo')} placeholder={t('source.repo')} value={source.repo} onChange={event => update(index, { repo: event.target.value })} style={input} />
      </label>
      <label style={field}><span style={fieldLabel}>{t('source.path')}</span>
        <input aria-label={t('source.path')} placeholder={t('source.path')} value={source.path} onChange={event => update(index, { path: event.target.value })} style={input} />
      </label>
      {sources.length > 1 && <button type="button" style={button} onClick={() => setSources(current => current.filter((_source, at) => at !== index))}>{t('source.remove')}</button>}
    </div>)}
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="button" style={button} onClick={() => setSources(current => [...current, emptySourceRow()])}>{t('source.add')}</button>
    </div>
    {failed && <p role="alert" style={alert}>{t('state.error')}</p>}
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="submit" style={button} disabled={busy}>{busy ? t('form.submitPending') : t('form.create')}</button>
      <button type="button" style={button} onClick={() => { setOpen(false); setFailed(false) }}>{t('form.cancel')}</button>
    </div>
  </form>
}

interface VersionFormProps {
  t: Translate
  project: ProjectRecord
  create(request: CreateVersionRequest): Promise<RemoteResult<VersionRecord>>
  onCreated(): void
}

/** Create one version with a ref per project repository; Lock generation stays separate. */
export function VersionForm({ t, project, create, onCreated }: VersionFormProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [refs, setRefs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!open) return <button style={button} onClick={() => setOpen(true)}>{t('version.new')}</button>
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const request = versionRequest(project, name, refs)
    if (request === undefined) { setFailed(true); return }
    setBusy(true); setFailed(false)
    try {
      const result = await create(request)
      if (!result.ok) { setFailed(true); return }
      setName(''); setRefs({}); setOpen(false); onCreated()
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  return <form style={box} onSubmit={event => { void submit(event) }}>
    <input aria-label={t('version.name')} placeholder={t('version.name')} value={name} onChange={event => setName(event.target.value)} style={input} />
    {project.config.sources.map(source => <input key={source.id} aria-label={`${t('source.ref')} ${source.id}`} placeholder={`${source.id}: ${t('source.ref')}`}
      value={refs[source.id] ?? ''} onChange={event => setRefs(current => ({ ...current, [source.id]: event.target.value }))} style={input} />)}
    {failed && <p role="alert" style={alert}>{t('state.error')}</p>}
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="submit" style={button} disabled={busy}>{busy ? t('form.submitPending') : t('form.create')}</button>
      <button type="button" style={button} onClick={() => { setOpen(false); setFailed(false) }}>{t('form.cancel')}</button>
    </div>
  </form>
}

interface TaskFormProps {
  t: Translate
  version: VersionRecord
  create(request: CreateTaskRequest): Promise<RemoteResult<TaskRecord>>
  onCreated(): void
}

/** Create one task under the selected version. */
export function TaskForm({ t, version, create, onCreated }: TaskFormProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!open) return <button style={button} onClick={() => setOpen(true)}>{t('task.new')}</button>
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const request = taskRequest(version, title)
    if (request === undefined) { setFailed(true); return }
    setBusy(true); setFailed(false)
    try {
      const result = await create(request)
      if (!result.ok) { setFailed(true); return }
      setTitle(''); setOpen(false); onCreated()
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  return <form style={box} onSubmit={event => { void submit(event) }}>
    <input aria-label={t('task.name')} placeholder={t('task.name')} value={title} onChange={event => setTitle(event.target.value)} style={input} />
    {failed && <p role="alert" style={alert}>{t('state.error')}</p>}
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="submit" style={button} disabled={busy}>{busy ? t('form.submitPending') : t('form.create')}</button>
      <button type="button" style={button} onClick={() => { setOpen(false); setFailed(false) }}>{t('form.cancel')}</button>
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
  const [failed, setFailed] = useState(false)
  async function run(): Promise<void> {
    setBusy(true); setFailed(false)
    try {
      const result = await generate({ versionId: version.id })
      if (!result.ok) { setFailed(true); return }
      onCreated()
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  return <div style={{ marginTop: 8 }}>
    <button style={button} disabled={busy} onClick={() => { void run() }}>{busy ? t('lock.resolving') : t('lock.new')}</button>
    {failed && <p role="alert" style={alert}>{t('state.error')}</p>}
  </div>
}
