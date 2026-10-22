/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { ProjectForm, TaskForm, VersionForm } from '../src/client/LoomForms.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'
import type { ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'

const t = (key: LoomKey) => en[key]
let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

it('advances from the name step with only a name before repositories are filled', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(ProjectForm, {
      t, open: true, create: async () => ({ ok: false, error: { code: 'invalid_form', message: 'unused' } }), onCreated: () => undefined,
    }))
  })
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Project name"]')
  expect(input).not.toBeNull()
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, '安抚')
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const next = [...container.querySelectorAll('button')].find(button => button.textContent === en['form.next'])
  expect(next).toBeDefined()
  await act(async () => { next?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  expect(container.textContent).toContain(en['source.hint'])
  expect(container.textContent).not.toContain('invalid_form')
  expect(container.querySelector('input[aria-label="Project name"]')).toBeNull()
})

it('edits a project on one page and saves without a wizard', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const project: ProjectRecord = {
    id: brandString<ProjectRecord['id']>('p1'),
    config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'shop' }], modules: [] },
  }
  let updates = 0
  let savedName = ''
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(ProjectForm, {
      t, open: true, project,
      create: async () => ({ ok: false, error: { code: 'unused', message: 'unused' } }),
      update: async request => { updates += 1; savedName = request.config.name; return { ok: true, value: project } },
      onCreated: () => undefined,
    }))
  })
  const find = (label: string) => [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent === label)
  expect(find(en['form.next'])).toBeUndefined()
  expect(container?.textContent).toContain(en['source.hint'])
  expect(container?.textContent).toContain(en['module.optional'])
  expect(updates).toBe(0)
  const save = find(en['form.save'])
  expect(save).toBeDefined()
  await act(async () => { save?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  expect(updates).toBe(1)
  expect(savedName).toBe('Shop')
})

it('picks a localized Agent preset with its description and saves the id', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const project: ProjectRecord = {
    id: brandString<ProjectRecord['id']>('p1'),
    config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'shop' }], modules: [] },
  }
  let savedPreset = ''
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(ProjectForm, {
      t, open: true, project,
      agentPresets: [
        { id: 'standard', isDefault: true, name: en['preset.standardName'], description: en['preset.standardDescription'] },
        { id: 'ptc', isDefault: false, name: en['preset.ptcName'], description: en['preset.ptcDescription'] },
      ],
      create: async () => ({ ok: false, error: { code: 'unused', message: 'unused' } }),
      update: async request => { savedPreset = request.config.agentPreset ?? ''; return { ok: true, value: project } },
      onCreated: () => undefined,
    }))
  })
  const click = async (target: Element | null | undefined) => {
    expect(target).toBeDefined()
    expect(target).not.toBeNull()
    await act(async () => { target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  const trigger = container.querySelector('button[aria-label="Agent preset"]')
  expect(trigger?.textContent).toContain(en['project.agentPresetDefault'])
  await click(trigger)
  expect(document.body.textContent).toContain(en['preset.ptcDescription'])
  const option = [...document.querySelectorAll('button')].find(button => button.textContent?.includes(en['preset.ptcName']))
  await click(option)
  expect(trigger?.textContent).toContain(en['preset.ptcName'])
  const next = () => [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent === en['form.next'])
  const save = [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent === en['form.save'])
  await click(save)
  expect(savedPreset).toBe('ptc')
})

it('walks a new version from name through refs to preview before creating', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const project: ProjectRecord = {
    id: brandString<ProjectRecord['id']>('p1'),
    config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'shop' }], modules: [] },
  }
  const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v1', sources: [] }
  let created: unknown
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(VersionForm, {
      t, open: true, project,
      create: async request => { created = request; return { ok: true, value: version } },
      onCreated: () => undefined,
    }))
  })
  const setValue = async (input: HTMLInputElement | HTMLTextAreaElement | null, value: string) => {
    expect(input).not.toBeNull()
    const setter = Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      setter?.call(input, value)
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const click = async (label: string) => {
    const target = [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent === label)
    expect(target).toBeDefined()
    await act(async () => { target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  await setValue(container.querySelector<HTMLInputElement>(`input[aria-label="${en['version.name']}"]`), 'v2')
  expect(container.textContent).toContain(en['version.step.refs'])
  await click(en['form.next'])
  await setValue(container.querySelector<HTMLInputElement>(`input[aria-label^="${en['source.branch']}"]`), 'main')
  expect(container.textContent).toContain(en['version.allRequired'])
  expect(container.textContent).toContain(en['version.lockHelperTitle'])
  await click(en['form.next'])
  expect(container.textContent).toContain(en['version.previewHint'])
  expect(created).toBeUndefined()
  await click(en['form.create'])
  expect(created).toMatchObject({ name: 'v2', sources: [{ sourceId: 'web', ref: 'main' }] })
})

it('walks a new task from content through optional scope to preview before creating', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const project: ProjectRecord = {
    id: brandString<ProjectRecord['id']>('p1'),
    config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'shop' }], modules: [] },
  }
  const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v1', sources: [] }
  const task: TaskRecord = { id: brandString<TaskRecord['id']>('t1'), projectId: project.id, versionId: version.id, title: 'Ship', status: 'pending' }
  let created: unknown
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(TaskForm, {
      t, open: true, project, version,
      create: async request => { created = request; return { ok: true, value: task } },
      onCreated: () => undefined,
    }))
  })
  const setValue = async (input: HTMLInputElement | null, value: string) => {
    expect(input).not.toBeNull()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      setter?.call(input, value)
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const click = async (label: string) => {
    const target = [...(container?.querySelectorAll('button') ?? [])].find(button => button.textContent === label)
    expect(target).toBeDefined()
    await act(async () => { target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  await setValue(container.querySelector<HTMLInputElement>(`input[aria-label="${en['task.name']}"]`), 'Ship')
  expect(container.textContent).toContain(en['task.step.scope'])
  await click(en['form.next'])
  expect(container.textContent).toContain(en['task.priority'])
  expect(container.textContent).toContain(en['form.skip'])
  await click(en['form.next'])
  expect(container.textContent).toContain(en['task.step.preview'])
  await click(en['form.create'])
  expect(created).toMatchObject({ title: 'Ship', versionId: 'v1' })
})

it('filters the local branch list from the typed ref and still accepts free text', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  class StubResizeObserver { observe(): void {} disconnect(): void {} }
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: StubResizeObserver })
  const project: ProjectRecord = {
    id: brandString<ProjectRecord['id']>('p1'),
    config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'web' }], modules: [] },
  }
  const version: VersionRecord = {
    id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v1',
    sources: [{ sourceId: brandString<'loom.source'>('web'), ref: 'main' }],
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(VersionForm, {
      t, open: true, project, version,
      listBranches: async () => ({ ok: true, value: { topLevel: '/repo/shop', current: 'main', branches: ['main', 'release/1.0'] } }),
      create: async () => ({ ok: false, error: { code: 'unused', message: 'unused' } }),
      update: async () => ({ ok: true, value: version }),
      onCreated: () => undefined,
    }))
  })
  const input = container.querySelector<HTMLInputElement>(`input[aria-label^="${en['source.branch']}"]`)
  expect(input).not.toBeNull()
  await act(async () => { input?.focus(); await Promise.resolve() })
  const arrow = container.querySelector<HTMLButtonElement>(`button[aria-label="${en['branch.open']}"]`)
  expect(arrow).not.toBeNull()
  await act(async () => { arrow?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  const labels = (): string[] => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map(item => item.textContent ?? '')
  expect(labels()).toEqual(['main', 'release/1.0'])
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, 'rel')
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(labels()).toEqual(['release/1.0'])
  await act(async () => {
    const release = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(item => item.textContent === 'release/1.0')
    release?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  expect(input?.value).toBe('release/1.0')
})
