import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { ImportProjectForm, LockButton, ProjectForm, TaskForm, emptySourceRow, parseImport, projectRequest, sourceIds, taskRequest, versionRequest } from '../src/client/LoomForms.tsx'
import { en, zh, type LoomKey } from '../src/client/locales.ts'
import type { ProjectRecord, VersionRecord } from 'dsh-workloom/types'
const t = (key: LoomKey) => en[key]
const project: ProjectRecord = {
  id: brandString<ProjectRecord['id']>('p1'),
  config: {
    name: 'Shop',
    sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'shop' }],
    modules: [],
  },
}
const version: VersionRecord = {
  id: brandString<VersionRecord['id']>('v1'),
  projectId: project.id,
  name: 'v1',
  sources: [{ sourceId: brandString<'loom.source'>('web'), ref: 'main' }],
}
it('preserves existing repository and module ids when editing', () => {
  const legacy = brandString<'loom.source'>('legacy')
  expect(sourceIds([{ id: legacy, repo: '/repo/shop', path: 'web' }])).toEqual(['legacy'])
  expect(projectRequest('Shop', [{ id: legacy, repo: '/repo/shop', path: 'web' }], [{ id: brandString<'loom.module'>('api'), source: 'legacy', path: 'src/api' }]))
    .toEqual({ name: 'Shop', sources: [{ id: 'legacy', repo: '/repo/shop', path: 'web' }], modules: [{ id: 'api', sourceId: 'legacy', path: 'src/api' }] })
  expect(projectRequest('Shop', [{ repo: '/repo/shop', path: 'web' }], [], 'planner')).toMatchObject({ agentPreset: 'planner' })
  expect(projectRequest('Shop', [{ repo: '/repo/shop', path: 'web' }], [])).not.toHaveProperty('agentPreset')
})

it('renders an existing project in the edit form instead of a creation trigger', () => {
  const markup = renderToStaticMarkup(createElement(ProjectForm, {
    t, open: true, project, create: async () => ({ ok: true, value: project }), update: async () => ({ ok: true, value: project }), onCreated: () => undefined,
  }))
  expect(markup).toContain('value="Shop"')
  expect(markup).toContain(`>${en['form.next']}<`)
  expect(markup).not.toContain(`>${en['form.save']}<`)
  expect(markup).toContain(en['project.step.sources'])
  expect(markup).toContain(en['project.step.preview'])
  expect(markup).not.toContain(en['project.new'])
})

it('renders a numbered project setup rail with a primary next action', () => {
  const html = renderToStaticMarkup(createElement(ProjectForm, { t, open: true, create: async () => ({ ok: true, value: project }), onCreated: () => undefined }))
  for (const label of [en['project.step.name'], en['project.step.sources'], en['project.step.modules'], en['project.step.preview']]) expect(html).toContain(label)
  expect(html).toContain(en['project.nameHint'])
  expect(html).toContain(en['project.agentPreset'])
  expect(html).toContain(en['project.agentPresetHint'])
  expect(html).toContain(`>${en['form.next']}<`)
  expect(html).not.toContain(`>${en['form.save']}<`)
})

it('starts a repository row empty instead of pre-filling placeholder values', () => {
  expect(emptySourceRow()).toEqual({ repo: '', path: '' })
})
it('derives repository ids from workspace directories and keeps them unique', () => {
  expect(sourceIds([{ repo: '/repo/shop', path: 'apps/web' }, { repo: '/repo/other', path: 'web' }])).toEqual(['web', 'web-2'])
  expect(sourceIds([{ repo: 'https://example.invalid/team/api.git', path: '' }])).toEqual(['api.git'])
})
it('derives module ids from their paths and requires a chosen repository', () => {
  expect(projectRequest('Shop', [{ repo: '/repo', path: 'web' }], [{ source: 'web', path: 'src/api' }]))
    .toEqual({ name: 'Shop', sources: [{ id: 'web', repo: '/repo', path: 'web' }], modules: [{ id: 'api', sourceId: 'web', path: 'src/api' }] })
  expect(projectRequest('Shop', [{ repo: '/repo', path: 'web' }], [{ source: '', path: 'src/api' }])).toBeUndefined()
})
it('trims project fields and derives the repository id from the directory', () => {
  expect(projectRequest('  Shop  ', [{ repo: ' /repo/shop ', path: ' shop ' }], []))
    .toEqual({ name: 'Shop', sources: [{ id: 'shop', repo: '/repo/shop', path: 'shop' }], modules: [] })
})
it('rejects incomplete project rows instead of posting them', () => {
  expect(projectRequest('', [{ repo: '/repo', path: 'web' }], [])).toBeUndefined()
  expect(projectRequest('Shop', [], [])).toBeUndefined()
  expect(projectRequest('Shop', [{ repo: ' ', path: 'web' }], [])).toBeUndefined()
  expect(projectRequest('Shop', [{ repo: '/repo', path: '  ' }], [])).toBeUndefined()
  expect(projectRequest('Shop', [{ repo: '/repo', path: 'web' }], [])).not.toBeUndefined()
})
it('builds one version source per project repository', () => {
  expect(versionRequest(project, ' v2 ', { web: ' release ' }))
    .toEqual({ projectId: project.id, name: 'v2', sources: [{ sourceId: 'web', ref: 'release' }] })
  expect(versionRequest(project, 'v2', {})).toBeUndefined()
  expect(versionRequest(project, ' ', { web: 'main' })).toBeUndefined()
})
it('requires a task title', () => {
  expect(taskRequest(version, ' Checkout ')).toEqual({ versionId: version.id, title: 'Checkout' })
  expect(taskRequest(version, '  ')).toBeUndefined()
})
it('submits task metadata only when it differs from the defaults', () => {
  expect(taskRequest(version, 'Checkout', { description: '  Review totals  ', priority: 'high', moduleIds: ['api'] }))
    .toEqual({ versionId: version.id, title: 'Checkout', description: 'Review totals', priority: 'high', moduleIds: ['api'] })
  expect(taskRequest(version, 'Checkout', { description: ' ', priority: 'normal', moduleIds: [] }))
    .toEqual({ versionId: version.id, title: 'Checkout' })
})
it('imports a project through the same admission rules without side effects', () => {
  const text = JSON.stringify({ name: ' Shop ', sources: [{ id: 'web', repo: '/repos/web', path: 'web' }], modules: [{ id: 'api', sourceId: 'web', path: 'src/api' }] })
  expect(parseImport(text)).toEqual({ ok: true, config: { name: ' Shop ', sources: [{ id: 'web', repo: '/repos/web', path: 'web' }], modules: [{ id: 'api', sourceId: 'web', path: 'src/api' }] } })
  expect(parseImport('{')).toEqual({ ok: false, reason: 'json' })
  expect(parseImport(JSON.stringify({ name: 'Shop', sources: [], modules: [], extra: true }))).toEqual({ ok: false, reason: 'invalid', field: 'project' })
  expect(parseImport(JSON.stringify({ name: 'Shop', sources: [{ id: 'web', repo: '/repos/web', path: 'web' }], modules: [{ id: 'api', sourceId: 'missing', path: 'src' }] }))).toEqual({ ok: false, reason: 'invalid', field: 'modules.0.sourceId' })
})
it('renders creation entry points with locale-owned labels', () => {
  const html = renderToStaticMarkup(createElement('div', null,
    createElement(ProjectForm, { t, create: () => Promise.reject(new Error('unused')), onCreated: () => {} }),
    createElement(TaskForm, { t, version, project, create: () => Promise.reject(new Error('unused')), onCreated: () => {} }),
    createElement(ImportProjectForm, { t, open: true, create: () => Promise.reject(new Error('unused')), onCreated: () => {} }),
    createElement(LockButton, { t, version, generate: () => Promise.reject(new Error('unused')), onCreated: () => {} })))
  for (const label of [en['project.new'], en['task.new'], en['lock.new'], en['project.importFile']]) expect(html).toContain(label)
  const chinese = renderToStaticMarkup(createElement(ProjectForm, { t: key => zh[key], create: () => Promise.reject(new Error('unused')), onCreated: () => {} }))
  expect(chinese).toContain(zh['project.new'])
})
