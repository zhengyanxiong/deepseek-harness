/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { LoomContextPanel } from '../src/client/LoomContextPanel.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'

const t = (key: LoomKey) => en[key]
let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

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

async function render(remove: () => Promise<RemoteResult<void>>): Promise<void> {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(LoomContextPanel, {
      t, snapshot, project, version, task, usage: undefined,
      generateLock: () => Promise.reject(new Error('unused')),
      onLockChanged: () => undefined,
      onDeleteTask: remove,
    }))
  })
}

function button(label: string): HTMLButtonElement {
  const found = [...(container?.querySelectorAll('button') ?? [])].find(candidate => candidate.textContent === label)
  if (found === undefined) throw new Error(`button ${label} is missing`)
  return found
}

it('asks for confirmation before deleting and reports a refused deletion', async () => {
  let calls = 0
  await render(async () => { calls += 1; return { ok: false, error: { code: 'task_workspace_uncleaned', message: 'task_workspace_uncleaned' } } })
  await act(async () => { button(en['task.delete']).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  expect(container?.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(en['delete.confirmTitle'])
  expect(container?.textContent).toContain(en['delete.taskWarning'])
  expect(container?.textContent).toContain(task.title)
  await act(async () => { button(en['delete.confirmAction']).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  expect(calls).toBe(1)
  expect(container?.textContent).toContain(en['error.taskWorkspaceUncleaned'])
  expect(container?.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(en['delete.confirmTitle'])
})

it('clears the confirmation after a successful deletion', async () => {
  await render(async () => ({ ok: true, value: undefined }))
  await act(async () => { button(en['task.delete']).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  await act(async () => { button(en['delete.confirmAction']).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  expect(container?.querySelector('[role="group"]')).toBeNull()
})
