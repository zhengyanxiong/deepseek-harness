import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { LockButton, ProjectForm, TaskForm, projectRequest, taskRequest, versionRequest } from '../src/client/LoomForms.tsx'
import { en, zh, type LoomKey } from '../src/client/locales.ts'
import type { ProjectRecord, VersionRecord } from 'dsh-loom/types'
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
it('trims project fields and detaches an empty module list', () => {
  expect(projectRequest('  Shop  ', [{ id: ' main ', repo: ' /repo/shop ', path: ' shop ' }]))
    .toEqual({ name: 'Shop', sources: [{ id: 'main', repo: '/repo/shop', path: 'shop' }], modules: [] })
})
it('rejects incomplete project rows instead of posting them', () => {
  expect(projectRequest('', [{ id: 'main', repo: '/repo', path: 'web' }])).toBeUndefined()
  expect(projectRequest('Shop', [])).toBeUndefined()
  expect(projectRequest('Shop', [{ id: ' ', repo: '/repo', path: 'web' }])).toBeUndefined()
  expect(projectRequest('Shop', [{ id: 'main', repo: ' ', path: 'web' }])).toBeUndefined()
  expect(projectRequest('Shop', [{ id: 'main', repo: '/repo', path: '  ' }])).toBeUndefined()
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
it('renders creation entry points with locale-owned labels', () => {
  const html = renderToStaticMarkup(createElement('div', null,
    createElement(ProjectForm, { t, create: () => Promise.reject(new Error('unused')), onCreated: () => {} }),
    createElement(TaskForm, { t, version, create: () => Promise.reject(new Error('unused')), onCreated: () => {} }),
    createElement(LockButton, { t, version, generate: () => Promise.reject(new Error('unused')), onCreated: () => {} })))
  for (const label of [en['project.new'], en['task.new'], en['lock.new']]) expect(html).toContain(label)
  const chinese = renderToStaticMarkup(createElement(ProjectForm, { t: key => zh[key], create: () => Promise.reject(new Error('unused')), onCreated: () => {} }))
  expect(chinese).toContain(zh['project.new'])
})
