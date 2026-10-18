import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { LoomContextPanel } from '../src/client/LoomContextPanel.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'
import type { CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'

const t = (key: LoomKey) => en[key]
const project: ProjectRecord = {
  id: brandString<ProjectRecord['id']>('p1'),
  config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/shop', path: 'shop' }], modules: [] },
}
const version: VersionRecord = {
  id: brandString<VersionRecord['id']>('v1'),
  projectId: project.id,
  name: 'v1',
  sources: [{ sourceId: brandString<'loom.source'>('web'), ref: 'main' }],
}
const task: TaskRecord = {
  id: brandString<TaskRecord['id']>('t1'),
  versionId: version.id,
  title: 'Checkout',
  status: 'pending',
  attempts: [],
}
const snapshot: CatalogSnapshot = { projects: [project], versions: [version], locks: [], tasks: [task], workspaces: [], audit: [], executions: [] }

it('renders project, version and task actions as labeled outline actions', () => {
  const html = renderToStaticMarkup(createElement(LoomContextPanel, {
    t, snapshot, project, version, task, usage: undefined,
    generateLock: () => Promise.reject(new Error('unused')),
    onLockChanged: () => undefined,
    onEditProject: () => undefined,
    onEditVersion: () => undefined,
    onEditTask: () => undefined,
    onDeleteProject: () => Promise.resolve({ ok: true, value: undefined }),
    onDeleteVersion: () => Promise.resolve({ ok: true, value: undefined }),
    onDeleteTask: () => Promise.resolve({ ok: true, value: undefined }),
  }))
  expect(html).toContain(en['project.edit'])
  expect(html).toContain(en['task.edit'])
  expect(html).toContain(en['project.delete'])
  expect(html).toContain(en['version.delete'])
  expect(html).toContain(en['task.delete'])
  expect(html).toContain(en['version.edit'])
  expect(html).toContain(en['lock.new'])
  expect(html).toMatch(/_outline_/u)
})
