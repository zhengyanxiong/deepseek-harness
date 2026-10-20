/** Inline creation and edit forms for Loom projects, versions and tasks. */
import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react'
import {
  Button, IconAgentPresetOutlineRegular, IconChevronDownOutlineRegular, IconChevronLeftOutlineRegular, IconDownloadOutlineRegular, IconFolderOpenRegular, IconInfoOutlineRegular, IconPlusOutlineRegular, IconTrashOutlineRegular, Menu,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CreateTaskRequest, CreateVersionRequest, GenerateLockRequest, Lock, ModuleConfig,
  ProjectConfig, ProjectRecord, SourceConfig, TaskRecord, TaskPriority, VersionRecord,
  UpdateProjectRequest, UpdateTaskRequest, UpdateVersionRequest, RepositoryBranches, RepositoryBranchesRequest,
} from 'dsh-workloom/types'
import { parseProject, ProjectError } from '../domain/project.ts'
import { COLORS, failureKey } from './shell.ts'
import { LoomWizardSteps } from './LoomWizardSteps.tsx'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

const formStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }
const stack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 }
const card: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, padding: 12, border: `0.5px solid ${COLORS.border}`, borderRadius: 'var(--dsw-radius-md)', background: COLORS.panel2 }
const input: CSSProperties = {
  width: '100%', height: 36, boxSizing: 'border-box', padding: '0 10px', border: `0.5px solid ${COLORS.borderStrong}`,
  borderRadius: 'var(--dsw-radius-sm)', background: COLORS.panel, color: COLORS.text, font: 'inherit', fontSize: 13, lineHeight: '20px',
}
const textarea: CSSProperties = { ...input, height: 'auto', minHeight: 88, padding: '8px 10px', resize: 'vertical' }
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 }
const fieldLabel: CSSProperties = { color: COLORS.dim, fontSize: 12, fontWeight: 500 }
const hint: CSSProperties = { margin: 0, color: COLORS.dim, fontSize: 11.5, lineHeight: 1.55 }
const alert: CSSProperties = { margin: 0, color: COLORS.dim, fontSize: 12 }
const failureCode: CSSProperties = { display: 'block', marginTop: 4, color: COLORS.error, fontFamily: 'ui-monospace, monospace', fontSize: 11, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
const footer: CSSProperties = { position: 'sticky', bottom: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4, paddingTop: 12, paddingBottom: 4, borderTop: `0.5px solid ${COLORS.border}`, background: COLORS.panel }
const footerSpacer: CSSProperties = { flex: 1, minWidth: 8 }
const previewRow: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', padding: '7px 8px', borderRadius: 'var(--dsw-radius-sm)', background: COLORS.panel, border: `0.5px solid ${COLORS.border}` }
const sectionHeading: CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }
const sectionHeadingTitle: CSSProperties = { margin: 0, fontSize: 13, fontWeight: 500, letterSpacing: '-.005em' }
const branchCard: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, padding: '13px 14px', border: `0.5px solid ${COLORS.border}`, borderRadius: 10, background: COLORS.panel }
const branchTop: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, minWidth: 0 }
const branchPath: CSSProperties = { minWidth: 0, flex: 1 }
const branchPathText: CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 11, lineHeight: 1.5, color: COLORS.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const branchPathNote: CSSProperties = { marginTop: 2, fontSize: 10, color: COLORS.faint }
const branchTag: CSSProperties = { display: 'inline-flex', alignItems: 'center', flex: 'none', maxWidth: '46%', padding: '2px 7px', borderRadius: 4, background: 'color-mix(in srgb, var(--loom-accent) 11%, transparent)', color: COLORS.accent, fontFamily: 'ui-monospace, monospace', fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const branchTagEmpty: CSSProperties = { ...branchTag, background: 'color-mix(in srgb, var(--dsw-alias-label-error) 8%, transparent)', color: COLORS.error, border: `0.5px solid color-mix(in srgb, var(--dsw-alias-label-error) 35%, transparent)` }
const branchError: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 5, margin: 0, color: COLORS.error, fontSize: 11, lineHeight: 1.5 }
const helperStrip: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 12px', marginTop: 2, borderRadius: 8, background: COLORS.panel2, border: `0.5px solid ${COLORS.border}`, color: COLORS.dim, fontSize: 11, lineHeight: 1.55 }

function FailureNotice({ failure, t }: { failure: string; t: Translate }) {
  const key = failureKey(failure)
  return <div role="alert" style={alert}>
    <p style={{ margin: 0 }}>{key === undefined ? t('state.error') : t(key)}</p>
    {failure !== 'invalid_form' && <code style={failureCode}>{failure}</code>}
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
export function projectRequest(name: string, sources: readonly SourceDraft[], modules: readonly ModuleDraft[], agentPreset = ''): ProjectConfig | undefined {
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
  const admittedPreset = agentPreset.trim()
  return { name: admittedName, sources: admittedSources, modules: admittedModules, ...(admittedPreset === '' ? {} : { agentPreset: admittedPreset }) }
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

/** One native Agent preset offered by the project form. */
export interface AgentPresetOption {
  readonly id: string
  readonly isDefault: boolean
  readonly name?: string
  readonly description?: string
  readonly broken?: string
}

function PresetOptionLabel({ name, description }: { readonly name: string; readonly description: string }) {
  return <span style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 280 }}>
    <span style={{ fontSize: 13, lineHeight: '20px', color: COLORS.text }}>{name}</span>
    <span style={{ fontSize: 12, lineHeight: '16px', color: COLORS.faint, whiteSpace: 'normal' }}>{description}</span>
  </span>
}

/** Free-text ref input backed by the repository's local branch list. */
export function BranchPicker({ t, source, value, listBranches, onChange, compact = false }: {
  t: Translate
  source: SourceConfig
  value: string
  listBranches?: ((request: RepositoryBranchesRequest) => Promise<RemoteResult<RepositoryBranches>>) | undefined
  onChange(value: string): void
  /** Hide the per-field label when the enclosing card already identifies the repository. */
  compact?: boolean
}) {
  const [branches, setBranches] = useState<readonly string[]>()
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const input = inputRef.current
    if (input === null || typeof ResizeObserver === 'undefined') return
    const apply = (): void => {
      const width = input.offsetWidth
      if (width > 0) document.documentElement.style.setProperty('--loom-branch-menu-width', `${width}px`)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(input)
    return () => { observer.disconnect() }
  }, [])
  async function load(): Promise<void> {
    if (listBranches === undefined || loading) return
    setLoading(true); setFailed(false)
    try {
      const result = await listBranches({ repo: source.repo })
      if (result.ok) setBranches(result.value.branches)
      else setFailed(true)
    } catch { setFailed(true) } finally { setLoading(false) }
  }
  const branchItems: MenuEntry[] = (branches ?? []).map(branch => ({ id: branch, label: branch }))
  return <div style={field}>
    {!compact && <span style={fieldLabel}>{t('source.branch')}</span>}
    <div style={{ display: 'flex', gap: 6 }}>
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <input ref={inputRef} aria-label={`${t('source.branch')} ${source.path}`}
          placeholder={t('source.branchPlaceholder')} value={value}
          onChange={event => onChange(event.target.value)}
          onFocus={() => { if (branches === undefined) void load() }} style={{ ...input, paddingRight: 32 }} />
        {listBranches !== undefined && <Menu open={open} onClose={() => setOpen(false)} items={branchItems} selectedId={value === '' ? undefined : value} selection="fill" portal listClassName="loom-branch-menu"
          getAnchorRect={() => inputRef.current?.getBoundingClientRect() ?? null}
          onSelect={branch => { onChange(branch); setOpen(false) }}
          anchor={<button type="button" aria-label={t('branch.open')} aria-haspopup="listbox" aria-expanded={open}
            onClick={() => {
              if (branches === undefined) void load()
              const width = inputRef.current?.offsetWidth ?? 0
              if (width > 0) document.documentElement.style.setProperty('--loom-branch-menu-width', `${width}px`)
              setOpen(current => !current)
            }}
            style={{ position: 'absolute', top: 0, right: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 36, padding: 0, border: 'none', background: 'transparent', color: COLORS.dim, cursor: 'pointer' }}>
            <IconChevronDownOutlineRegular size={16} />
          </button>} />}
      </div>
      {listBranches !== undefined && <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => { void load() }}>{loading ? t('branch.loading') : t('branch.load')}</Button>}
    </div>
    <p style={hint}>
      {failed ? t('branch.unavailable') : branches === undefined ? t('branch.chooseOrType') : t('branch.available').replace('{count}', String(branches.length))}
    </p>
  </div>
}

interface ProjectFormProps {
  t: Translate
  create(request: ProjectConfig): Promise<RemoteResult<ProjectRecord>>
  update?(request: UpdateProjectRequest): Promise<RemoteResult<ProjectRecord>>
  project?: ProjectRecord
  agentPresets?: readonly AgentPresetOption[]
  pickDirectory?: (startPath?: string) => Promise<string | null>
  onCreated(project: ProjectRecord): void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onBusyChange?: (busy: boolean) => void
}

type ProjectStep = 'name' | 'sources' | 'modules' | 'preview'

const PROJECT_STEPS: readonly { readonly key: ProjectStep; readonly label: LoomKey }[] = [
  { key: 'name', label: 'project.step.name' },
  { key: 'sources', label: 'project.step.sources' },
  { key: 'modules', label: 'project.step.modules' },
  { key: 'preview', label: 'project.step.preview' },
]

/** Create or edit one project with its repositories, optional modules and a preview before saving. */
export function ProjectForm({ t, create, update, project, agentPresets = [], pickDirectory, onCreated, open: controlledOpen, onOpenChange, onBusyChange }: ProjectFormProps) {
  const editing = project !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (value: boolean): void => { setInternalOpen(value); onOpenChange?.(value) }
  const [step, setStep] = useState<ProjectStep>(editing ? 'preview' : 'name')
  const [name, setName] = useState(project?.config.name ?? '')
  const [sources, setSources] = useState<SourceDraft[]>(project === undefined ? [emptySourceRow()] : project.config.sources.map(source => ({ id: source.id, repo: source.repo, path: source.path })))
  const [modules, setModules] = useState<ModuleDraft[]>(project === undefined ? [] : project.config.modules.map(module => ({ id: module.id, source: module.sourceId, path: module.path })))
  const [agentPreset, setAgentPreset] = useState(project?.config.agentPreset ?? '')
  const [presetOpen, setPresetOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const reportBusy = (value: boolean): void => { setBusy(value); onBusyChange?.(value) }
  const [failure, setFailure] = useState<string>()
  if (!open) return editing ? null : <Button variant="outline" icon={<IconPlusOutlineRegular />} onClick={() => setOpen(true)}>{t('project.new')}</Button>
  const ids = sourceIds(sources)
  const request = projectRequest(name, sources, modules, agentPreset)
  const selectedPreset = agentPresets.find(candidate => candidate.id === agentPreset)
  const presetLabel = agentPreset === '' ? t('project.agentPresetDefault') : selectedPreset?.name ?? agentPreset
  const presetItems: MenuEntry[] = [
    { id: '', label: <PresetOptionLabel name={t('project.agentPresetDefault')} description={t('project.agentPresetDefaultHint')} /> },
    ...(agentPreset !== '' && selectedPreset === undefined
      ? [{ id: agentPreset, label: <PresetOptionLabel name={agentPreset} description={t('project.agentPresetUnavailable')} /> }]
      : []),
    ...agentPresets.map(candidate => ({
      id: candidate.id,
      disabled: candidate.broken !== undefined,
      label: <PresetOptionLabel name={candidate.name ?? candidate.id} description={candidate.broken === undefined ? candidate.description ?? t('preset.noDescription') : t('project.agentPresetBroken')} />,
    })),
  ]
  const nameReady = name.trim() !== ''
  const sourcesReady = projectRequest(name, sources, []) !== undefined
  const stepIndex = PROJECT_STEPS.findIndex(candidate => candidate.key === step)
  function canVisit(candidate: ProjectStep): boolean {
    if (candidate === 'name') return true
    if (candidate === 'sources') return nameReady
    if (candidate === 'modules') return sourcesReady
    return request !== undefined
  }
  function goTo(candidate: ProjectStep): void {
    if (canVisit(candidate)) { setStep(candidate); setFailure(undefined); setPresetOpen(false) }
  }
  function advance(): boolean {
    const candidate = PROJECT_STEPS[stepIndex + 1]
    if (candidate === undefined || !canVisit(candidate.key)) return false
    goTo(candidate.key)
    return true
  }
  function back(): void {
    const candidate = PROJECT_STEPS[stepIndex - 1]
    if (candidate !== undefined) setStep(candidate.key)
  }
  function reset(): void {
    if (editing) { setOpen(false); setFailure(undefined); setPresetOpen(false); return }
    setName(''); setSources([emptySourceRow()]); setModules([]); setAgentPreset(''); setPresetOpen(false); setStep('name'); setOpen(false); setFailure(undefined)
  }
  function updateSource(index: number, patch: Partial<SourceDraft>): void {
    setSources(current => current.map((source, at) => at === index ? { ...source, ...patch } : source))
  }
  function updateModule(index: number, patch: Partial<ModuleDraft>): void {
    setModules(current => current.map((module, at) => at === index ? { ...module, ...patch } : module))
  }
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!editing && step !== 'preview') {
      if (!advance()) setFailure('invalid_form')
      return
    }
    if (request === undefined) { setFailure('invalid_form'); return }
    reportBusy(true); setFailure(undefined)
    try {
      const result = editing
        ? update === undefined ? undefined : await update({ projectId: project.id, config: request })
        : await create(request)
      if (result === undefined || !result.ok) { setFailure(result === undefined ? t('state.error') : result.error.message); return }
      reset(); onCreated(result.value)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally { reportBusy(false) }
  }
  const primaryLabel = busy ? t('form.submitPending') : step === 'preview' ? (editing ? t('form.save') : t('form.create')) : t('form.next')
  const nameFields = <section style={stack}>
      <label style={field}><span style={fieldLabel}>{t('project.name')}</span>
        <input aria-label={t('project.name')} placeholder={t('project.name')} value={name} onChange={event => setName(event.target.value)} style={input} />
      </label>
      <p style={hint}>{t('project.nameHint')}</p>
      <label style={field}><span style={fieldLabel}>{t('project.agentPreset')}</span>
        <Menu open={presetOpen} onClose={() => setPresetOpen(false)} items={presetItems} selectedId={agentPreset} portal
          onSelect={id => { setAgentPreset(id); setPresetOpen(false) }}
          anchor={<button type="button" title={presetLabel} aria-label={t('project.agentPreset')} aria-haspopup="menu" aria-expanded={presetOpen} onClick={() => setPresetOpen(value => !value)}
            style={{ ...input, display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px', textAlign: 'left', cursor: 'pointer' }}>
            <IconAgentPresetOutlineRegular size={14} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{presetLabel}</span>
            <IconChevronDownOutlineRegular size={12} />
          </button>} />
      </label>
      <p style={hint}>{t('project.agentPresetHint')}</p>
    </section>;
  const sourceFields = <section style={stack}>
      <p style={hint}>{t('source.hint')}</p>
      {sources.map((source, index) => <div key={index} style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...fieldLabel, flex: 1 }}>{t('source.item')} {index + 1}</span>
          {sources.length > 1 && <Button type="button" size="sm" variant="ghost" icon={<IconTrashOutlineRegular />} onClick={() => setSources(current => current.filter((_source, at) => at !== index))}>{t('source.remove')}</Button>}
        </div>
        <div style={field}><span style={fieldLabel}>{t('source.repo')}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <input aria-label={t('source.repo')} placeholder={t('source.repoHint')} value={source.repo} onChange={event => updateSource(index, { repo: event.target.value })} style={{ ...input, flex: 1 }} />
            {pickDirectory !== undefined && <Button type="button" variant="outline" icon={<IconFolderOpenRegular />} onClick={() => {
              void pickDirectory(source.repo.trim() === '' ? undefined : source.repo.trim()).then(picked => {
                if (picked === null) return
                updateSource(index, { repo: picked, ...(source.path.trim() === '' ? { path: picked.split(/[\\/]/u).filter(Boolean).at(-1) ?? '' } : {}) })
              })
            }}>{t('source.browse')}</Button>}
          </div>
          <p style={hint}>{t('source.repoHint')}</p>
        </div>
        <label style={field}><span style={fieldLabel}>{t('source.path')}</span>
          <input aria-label={t('source.path')} placeholder={t('source.path')} value={source.path} onChange={event => updateSource(index, { path: event.target.value })} style={input} />
          <p style={hint}>{t('source.pathHint')}</p>
        </label>
      </div>)}
      <Button type="button" variant="outline" icon={<IconPlusOutlineRegular />} style={{ alignSelf: 'flex-start' }} onClick={() => setSources(current => [...current, emptySourceRow()])}>{t('source.add')}</Button>
    </section>;
  const moduleFields = <section style={stack}>
      <p style={hint}>{t('module.optional')}</p>
      {modules.map((module, index) => <div key={index} style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...fieldLabel, flex: 1 }}>{t('module.item')} {index + 1}</span>
          <Button type="button" size="sm" variant="ghost" icon={<IconTrashOutlineRegular />} onClick={() => setModules(current => current.filter((_module, at) => at !== index))}>{t('module.remove')}</Button>
        </div>
        <label style={field}><span style={fieldLabel}>{t('module.source')}</span>
          <select aria-label={t('module.source')} value={module.source} onChange={event => updateModule(index, { source: event.target.value })} style={input}>
            <option value="">{t('module.source')}</option>
            {sources.map((source, at) => <option key={at} value={ids[at]}>{source.path}</option>)}
          </select>
        </label>
        <label style={field}><span style={fieldLabel}>{t('module.path')}</span>
          <input aria-label={t('module.path')} placeholder={t('module.path')} value={module.path} onChange={event => updateModule(index, { path: event.target.value })} style={input} />
        </label>
      </div>)}
      <Button type="button" variant="outline" icon={<IconPlusOutlineRegular />} style={{ alignSelf: 'flex-start' }} onClick={() => setModules(current => [...current, emptyModuleRow()])}>{t('module.add')}</Button>
    </section>;
  return <form style={formStyle} onSubmit={event => { void submit(event) }}>
    {!editing && <LoomWizardSteps t={t} steps={PROJECT_STEPS} current={step} ariaLabel="project.steps" canVisit={canVisit} onSelect={goTo} />}
    {(editing || step === 'name') && nameFields}
    {(editing || step === 'sources') && sourceFields}
    {(editing || step === 'modules') && moduleFields}
    {!editing && step === 'preview' && <section style={stack}>
      <p style={hint}>{t('project.previewHint')}</p>
      {request === undefined ? <p role="alert" style={alert}>{t('form.required')}</p> : <div style={card}>
        <div style={field}><span style={fieldLabel}>{t('project.name')}</span><span>{request.name}</span></div>
        <div style={field}><span style={fieldLabel}>{t('project.agentPreset')}</span><span>{presetLabel}</span></div>
        <div style={field}><span style={fieldLabel}>{t('source.title')}</span>
          {request.sources.map(source => <div key={source.id} style={previewRow}>
            <span style={{ color: COLORS.dim, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{source.id}</span>
            <span style={{ color: COLORS.text, overflowWrap: 'anywhere' }}>{source.repo}</span>
            <span style={{ color: COLORS.faint }}>→ {source.path}</span>
          </div>)}
        </div>
        <div style={field}><span style={fieldLabel}>{t('module.title')}</span>
          {request.modules.length === 0 ? <span style={hint}>{t('module.optional')}</span> : request.modules.map(module => <div key={module.id} style={previewRow}>
            <span style={{ color: COLORS.dim, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{module.id}</span>
            <span style={{ color: COLORS.text, overflowWrap: 'anywhere' }}>{module.sourceId} / {module.path}</span>
          </div>)}
        </div>
      </div>}
    </section>}
    {failure !== undefined && <FailureNotice failure={failure} t={t} />}
    <div style={footer}>
      <Button type="button" variant="ghost" disabled={busy} onClick={reset}>{t('form.cancel')}</Button>
      <span style={footerSpacer} />
      {!editing && stepIndex > 0 && <Button type="button" variant="outline" icon={<IconChevronLeftOutlineRegular />} onClick={back}>{t('form.back')}</Button>}
      {!editing && step === 'modules' && <Button type="button" variant="ghost" onClick={() => goTo('preview')}>{t('form.skip')}</Button>}
      <Button type="submit" variant="primary" className="loom-primary" disabled={busy || (step === 'preview' ? request === undefined : !canVisit(PROJECT_STEPS[stepIndex + 1]?.key ?? 'preview'))}>{primaryLabel}</Button>
    </div>
  </form>
}

interface VersionFormProps {
  t: Translate
  project: ProjectRecord
  listBranches?: (request: RepositoryBranchesRequest) => Promise<RemoteResult<RepositoryBranches>>
  create(request: CreateVersionRequest): Promise<RemoteResult<VersionRecord>>
  update?(request: UpdateVersionRequest): Promise<RemoteResult<VersionRecord>>
  version?: VersionRecord
  onCreated(version: VersionRecord): void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onBusyChange?: (busy: boolean) => void
  /** Notify the modal shell when the wizard advances, for its step subtitle. */
  onStepChange?: (step: VersionStep) => void
}

/** One version-creation step. */
export type VersionStep = 'name' | 'refs' | 'preview'

const VERSION_STEPS: readonly { readonly key: VersionStep; readonly label: LoomKey }[] = [
  { key: 'name', label: 'version.step.name' },
  { key: 'refs', label: 'version.step.refs' },
  { key: 'preview', label: 'version.step.preview' },
]

/** Create or edit one version with a ref per project repository; Lock generation stays separate. */
export function VersionForm({ t, project, listBranches, create, update, version, onCreated, open: controlledOpen, onOpenChange, onBusyChange, onStepChange }: VersionFormProps) {
  const editing = version !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (value: boolean): void => { setInternalOpen(value); onOpenChange?.(value) }
  const [step, setStep] = useState<VersionStep>('name')
  const [name, setName] = useState(version?.name ?? '')
  const [refs, setRefs] = useState<Record<string, string>>(version === undefined ? {} : Object.fromEntries(version.sources.map(source => [source.sourceId, source.ref])))
  const [busy, setBusy] = useState(false)
  const reportBusy = (value: boolean): void => { setBusy(value); onBusyChange?.(value) }
  const [failure, setFailure] = useState<string>()
  if (!open) return editing ? null : <Button variant="outline" icon={<IconPlusOutlineRegular />} onClick={() => setOpen(true)}>{t('version.new')}</Button>
  const request = versionRequest(project, name, refs)
  const stepIndex = VERSION_STEPS.findIndex(candidate => candidate.key === step)
  const nameReady = name.trim() !== ''
  function canVisit(candidate: VersionStep): boolean {
    if (candidate === 'name') return true
    if (candidate === 'refs') return nameReady
    return request !== undefined
  }
  function goTo(candidate: VersionStep): void {
    if (!canVisit(candidate)) return
    setStep(candidate); setFailure(undefined); onStepChange?.(candidate)
  }
  function advance(): boolean {
    const candidate = VERSION_STEPS[stepIndex + 1]
    if (candidate === undefined || !canVisit(candidate.key)) return false
    goTo(candidate.key)
    return true
  }
  function back(): void {
    const candidate = VERSION_STEPS[stepIndex - 1]
    if (candidate !== undefined) setStep(candidate.key)
  }
  function close(): void { setOpen(false); setFailure(undefined) }
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!editing && step !== 'preview') {
      if (!advance()) setFailure('invalid_form')
      return
    }
    if (request === undefined) { setFailure('invalid_form'); return }
    reportBusy(true); setFailure(undefined)
    try {
      const result = editing
        ? update === undefined ? undefined : await update({ versionId: version.id, name: request.name, sources: request.sources })
        : await create(request)
      if (result === undefined || !result.ok) { setFailure(result === undefined ? t('state.error') : result.error.message); return }
      close(); onCreated(result.value)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally { reportBusy(false) }
  }
  const primaryLabel = busy ? t('form.submitPending') : !editing && step !== 'preview' ? t('form.next') : editing ? t('form.save') : t('form.create')
  const sourceFor = (id: string) => project.config.sources.find(source => source.id === id)
  return <form style={formStyle} onSubmit={event => { void submit(event) }}>
    {!editing && <LoomWizardSteps t={t} steps={VERSION_STEPS} current={step} ariaLabel="version.steps" canVisit={canVisit} onSelect={goTo} />}
    {(editing || step === 'name') && <section style={stack}>
      <label style={field}><span style={fieldLabel}>{t('version.name')}</span>
        <input aria-label={t('version.name')} placeholder={t('version.name')} value={name} onChange={event => setName(event.target.value)} style={input} />
      </label>
      {editing && <p style={hint}>{t('version.refHint')}</p>}
    </section>}
    {(editing || step === 'refs') && <section style={stack}>
      {!editing && <div style={sectionHeading}><h3 style={sectionHeadingTitle}>{t('version.references')}</h3><span style={hint}>{t('version.allRequired')}</span></div>}
      {project.config.sources.map(source => {
        const ref = refs[source.id] ?? ''
        const missing = ref.trim() === ''
        return <div key={source.id} style={branchCard}>
          <div style={branchTop}>
            <div style={branchPath}>
              <div style={branchPathText} title={source.path}>{source.path}</div>
              <div style={branchPathNote}>{source.repo}</div>
            </div>
            <span style={missing ? branchTagEmpty : branchTag} title={missing ? undefined : ref}>{missing ? t('version.unselected') : ref}</span>
          </div>
          <BranchPicker t={t} source={source} value={ref} listBranches={listBranches} compact
            onChange={value => setRefs(current => ({ ...current, [source.id]: value }))} />
          {missing && <p style={branchError} role="alert"><IconInfoOutlineRegular size={13} />{t('version.branchRequired')}</p>}
        </div>
      })}
      <div style={helperStrip}><span style={{ flex: 'none', marginTop: 1, display: 'inline-flex' }}><IconInfoOutlineRegular size={14} /></span><span><b style={{ fontWeight: 500, color: COLORS.text }}>{t('version.lockHelperTitle')}</b> {t('version.lockHelperBody')}</span></div>
    </section>}
    {!editing && step === 'preview' && <section style={stack}>
      <p style={hint}>{t('version.previewHint')}</p>
      {request === undefined ? <p role="alert" style={alert}>{t('form.required')}</p> : <div style={card}>
        <div style={field}><span style={fieldLabel}>{t('version.name')}</span><span>{request.name}</span></div>
        <div style={field}><span style={fieldLabel}>{t('version.repositories')}</span>
          {request.sources.map(entry => <div key={entry.sourceId} style={previewRow}>
            <span style={{ color: COLORS.text, overflowWrap: 'anywhere' }}>{sourceFor(entry.sourceId)?.path ?? entry.sourceId}</span>
            <span style={{ color: COLORS.faint, fontFamily: 'ui-monospace, monospace' }}>{entry.ref}</span>
          </div>)}
        </div>
        <div style={field}><span style={fieldLabel}>{t('lock.title')}</span><span style={hint}>{t('version.previewHint')}</span></div>
      </div>}
    </section>}
    {failure !== undefined && <FailureNotice failure={failure} t={t} />}
    <div style={footer}>
      <Button type="button" variant="ghost" disabled={busy} onClick={close}>{t('form.cancel')}</Button>
      <span style={footerSpacer} />
      {!editing && stepIndex > 0 && <Button type="button" variant="outline" icon={<IconChevronLeftOutlineRegular />} onClick={back}>{t('form.back')}</Button>}
      <Button type="submit" variant="primary" className="loom-primary" disabled={busy || (!editing && step !== 'preview' && !canVisit(VERSION_STEPS[stepIndex + 1]?.key ?? 'preview'))}>{primaryLabel}</Button>
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
  onBusyChange?: (busy: boolean) => void
}

/** One task-creation step. */
type TaskStep = 'content' | 'scope' | 'preview'

const TASK_STEPS: readonly { readonly key: TaskStep; readonly label: LoomKey }[] = [
  { key: 'content', label: 'task.step.content' },
  { key: 'scope', label: 'task.step.scope' },
  { key: 'preview', label: 'task.step.preview' },
]
const PRIORITY_LABEL: Readonly<Record<TaskPriority, LoomKey>> = { low: 'task.priority.low', normal: 'task.priority.normal', high: 'task.priority.high' }

/** Create or edit one task under the selected version. */
export function TaskForm({ t, version, project, create, update, task, onCreated, open: controlledOpen, onOpenChange, onBusyChange }: TaskFormProps) {
  const editing = task !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (value: boolean): void => { setInternalOpen(value); onOpenChange?.(value) }
  const [step, setStep] = useState<TaskStep>('content')
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'normal')
  const [moduleIds, setModuleIds] = useState<string[]>([...(task?.moduleIds ?? [])])
  const [busy, setBusy] = useState(false)
  const reportBusy = (value: boolean): void => { setBusy(value); onBusyChange?.(value) }
  const [failure, setFailure] = useState<string>()
  if (!open) return editing ? null : <Button variant="outline" icon={<IconPlusOutlineRegular />} onClick={() => setOpen(true)}>{t('task.new')}</Button>
  const request = taskRequest(version, title, { description, priority, moduleIds })
  const stepIndex = TASK_STEPS.findIndex(candidate => candidate.key === step)
  const titleReady = title.trim() !== ''
  function canVisit(candidate: TaskStep): boolean {
    if (candidate === 'content') return true
    if (candidate === 'scope') return titleReady
    return request !== undefined
  }
  function goTo(candidate: TaskStep): void {
    if (!canVisit(candidate)) return
    setStep(candidate); setFailure(undefined)
  }
  function advance(): boolean {
    const candidate = TASK_STEPS[stepIndex + 1]
    if (candidate === undefined || !canVisit(candidate.key)) return false
    goTo(candidate.key)
    return true
  }
  function back(): void {
    const candidate = TASK_STEPS[stepIndex - 1]
    if (candidate !== undefined) setStep(candidate.key)
  }
  function close(): void { setOpen(false); setFailure(undefined) }
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!editing && step !== 'preview') {
      if (!advance()) setFailure('invalid_form')
      return
    }
    if (request === undefined) { setFailure('invalid_form'); return }
    reportBusy(true); setFailure(undefined)
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
      close(); onCreated(result.value)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally { reportBusy(false) }
  }
  const primaryLabel = busy ? t('form.submitPending') : !editing && step !== 'preview' ? t('form.next') : editing ? t('form.save') : t('form.create')
  const selectedModules = project.config.modules.filter(module => moduleIds.includes(module.id))
  return <form style={formStyle} onSubmit={event => { void submit(event) }}>
    {!editing && <LoomWizardSteps t={t} steps={TASK_STEPS} current={step} ariaLabel="task.steps" canVisit={canVisit} onSelect={goTo} />}
    {(editing || step === 'content') && <section style={stack}>
      <label style={field}><span style={fieldLabel}>{t('task.name')}</span>
        <input aria-label={t('task.name')} placeholder={t('task.name')} value={title} onChange={event => setTitle(event.target.value)} style={input} />
      </label>
      <label style={field}><span style={fieldLabel}>{t('task.description')}</span>
        <textarea aria-label={t('task.description')} placeholder={t('task.description')} value={description} maxLength={4000} rows={6} onChange={event => setDescription(event.target.value)} style={textarea} />
      </label>
    </section>}
    {(editing || step === 'scope') && <section style={stack}>
      <p style={hint}>{t('task.draftHint')}</p>
      <label style={field}><span style={fieldLabel}>{t('task.priority')}</span>
        <select aria-label={t('task.priority')} value={priority} onChange={event => setPriority(event.target.value as TaskPriority)} style={input}>
          <option value="low">{t('task.priority.low')}</option>
          <option value="normal">{t('task.priority.normal')}</option>
          <option value="high">{t('task.priority.high')}</option>
        </select>
      </label>
      <div style={field}>
        <span style={fieldLabel}>{t('task.modules')}</span>
        {project.config.modules.length === 0 && <p style={hint}>{t('task.noModules')}</p>}
        {project.config.modules.map(module => <label key={module.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 'var(--dsw-radius-sm)', border: `0.5px solid ${COLORS.border}`, background: COLORS.panel2, color: COLORS.dim, fontSize: 12 }}>
          <input type="checkbox" checked={moduleIds.includes(module.id)} onChange={event => setModuleIds(current => event.target.checked ? [...current, module.id] : current.filter(id => id !== module.id))} />
          <span style={{ color: COLORS.text }}>{module.path}</span>
          <span style={{ marginLeft: 'auto', color: COLORS.faint, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{module.id}</span>
        </label>)}
      </div>
    </section>}
    {!editing && step === 'preview' && <section style={stack}>
      <p style={hint}>{t('task.draftHint')}</p>
      {request === undefined ? <p role="alert" style={alert}>{t('form.required')}</p> : <div style={card}>
        <div style={field}><span style={fieldLabel}>{t('task.name')}</span><span>{request.title}</span></div>
        <div style={field}><span style={fieldLabel}>{t('task.version')}</span><span>{version.name}</span></div>
        <div style={field}><span style={fieldLabel}>{t('task.priority')}</span><span>{t(PRIORITY_LABEL[request.priority ?? 'normal'])}</span></div>
        <div style={field}><span style={fieldLabel}>{t('task.modules')}</span>
          {selectedModules.length === 0 ? <span style={hint}>{t('task.noModules')}</span> : selectedModules.map(module => <div key={module.id} style={previewRow}>
            <span style={{ color: COLORS.text, overflowWrap: 'anywhere' }}>{module.path}</span>
            <span style={{ color: COLORS.faint, fontFamily: 'ui-monospace, monospace' }}>{module.id}</span>
          </div>)}
        </div>
        {request.description !== undefined && <div style={field}><span style={fieldLabel}>{t('task.description')}</span><span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{request.description}</span></div>}
      </div>}
    </section>}
    {failure !== undefined && <FailureNotice failure={failure} t={t} />}
    <div style={footer}>
      <Button type="button" variant="ghost" disabled={busy} onClick={close}>{t('form.cancel')}</Button>
      <span style={footerSpacer} />
      {!editing && stepIndex > 0 && <Button type="button" variant="outline" icon={<IconChevronLeftOutlineRegular />} onClick={back}>{t('form.back')}</Button>}
      {!editing && step === 'scope' && <Button type="button" variant="ghost" onClick={() => goTo('preview')}>{t('form.skip')}</Button>}
      <Button type="submit" variant="primary" className="loom-primary" disabled={busy || (!editing && step !== 'preview' && !canVisit(TASK_STEPS[stepIndex + 1]?.key ?? 'preview'))}>{primaryLabel}</Button>
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
  onBusyChange?: (busy: boolean) => void
}

/** Validate a JSON project file, preview repositories and modules, then save it explicitly. */
export function ImportProjectForm({ t, create, onCreated, open: controlledOpen, onOpenChange, onBusyChange }: ImportProjectFormProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (value: boolean): void => { setInternalOpen(value); onOpenChange?.(value) }
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<ImportProjectResult>()
  const [busy, setBusy] = useState(false)
  const reportBusy = (value: boolean): void => { setBusy(value); onBusyChange?.(value) }
  const [failed, setFailed] = useState(false)
  if (!open) return <Button variant="outline" icon={<IconDownloadOutlineRegular />} onClick={() => setOpen(true)}>{t('project.import')}</Button>
  async function choose(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (file === undefined) return
    setFileName(file.name); setFailed(false)
    setResult(parseImport(await file.text()))
  }
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (result?.ok !== true) { setFailed(true); return }
    reportBusy(true); setFailed(false)
    try {
      const created = await create(result.config)
      if (!created.ok) { setFailed(true); return }
      reportBusy(false); setResult(undefined); setFileName(''); setOpen(false); onCreated(created.value)
    } catch { setFailed(true); reportBusy(false) }
  }
  return <form style={formStyle} onSubmit={event => { void submit(event) }}>
    <label style={field}><span style={fieldLabel}>{t('project.importFile')}</span>
      <input aria-label={t('project.importFile')} type="file" accept=".json,application/json" onChange={event => { void choose(event) }} style={{ ...input, height: 'auto', padding: '7px 10px' }} />
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
    <div style={footer}>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => { setOpen(false); setResult(undefined); setFileName(''); setFailed(false) }}>{t('form.cancel')}</Button>
      <span style={footerSpacer} />
      <Button type="submit" variant="primary" className="loom-primary" disabled={busy || result?.ok !== true}>{busy ? t('form.submitPending') : t('project.importConfirm')}</Button>
    </div>
  </form>
}

interface LockButtonProps {
  t: Translate
  version: VersionRecord
  generate(request: GenerateLockRequest): Promise<RemoteResult<Lock>>
  onCreated(): void
  existing?: boolean
  disabled?: boolean
  /** Keep the existing-Lock explanation under the action; callers with their own one-line note disable it. */
  hint?: boolean
}

/** Pin every repository ref of the selected version into a new immutable Lock. */
export function LockButton({ t, version, generate, onCreated, existing = false, disabled = false, hint = true }: LockButtonProps) {
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
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
    <Button size={existing ? 'sm' : 'md'} variant={existing ? 'outline' : 'primary'} className={existing ? undefined : 'loom-primary'} disabled={busy || disabled} onClick={() => { void run() }}>
      {busy ? t('lock.resolving') : existing ? t('lock.regenerate') : t('lock.new')}
    </Button>
    {existing && hint && <p style={{ margin: 0, color: COLORS.faint, fontSize: 10.5, lineHeight: 1.5 }}>{t('lock.regenerateHint')}</p>}
    {disabled && <p style={{ margin: 0, color: COLORS.faint, fontSize: 10.5, lineHeight: 1.5 }}>{t('lock.disabledRunning')}</p>}
    {failure !== undefined && <FailureNotice failure={failure} t={t} />}
  </div>
}
