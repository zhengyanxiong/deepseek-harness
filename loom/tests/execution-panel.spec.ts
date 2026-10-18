import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { ExecutionPanel, type ExecutionActions } from '../src/client/LoomExecution.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'
import type { CatalogSnapshot, Lock, TaskRecord, VersionRecord, WorkspaceRecord } from 'dsh-loom/types'
const t = (key: LoomKey) => en[key]
const versionId = brandString<VersionRecord['id']>('v1')
const lock: Lock = {
  id: brandString<Lock['id']>('lock1'),
  versionId,
  repositories: [{ sourceId: brandString<'loom.source'>('web'), commit: 'a'.repeat(40) }],
}
const workspace: WorkspaceRecord = {
  id: brandString<WorkspaceRecord['id']>('w1'),
  versionId,
  lockId: lock.id,
  path: '/tmp/loom/workspace',
}
const snapshot: CatalogSnapshot = {
  projects: [],
  versions: [{ id: versionId, projectId: brandString<'loom.project'>('p1'), name: 'v1', sources: [{ sourceId: lock.repositories[0]!.sourceId, ref: 'main' }] }],
  locks: [lock],
  tasks: [],
  workspaces: [workspace],
}
const pending: TaskRecord = { id: brandString<TaskRecord['id']>('t1'), versionId, title: 'Checkout', status: 'pending', attempts: [] }
const running: TaskRecord = {
  ...pending,
  status: 'running',
  attempts: [{
    id: brandString<'loom.attempt'>('a1'), lock, workspaceId: workspace.id,
    sessionIds: [brandString<'SessionId'>('s1')], status: 'running',
  }],
}
const actions: ExecutionActions = {
  prepareWorkspace: () => Promise.reject(new Error('unused')),
  startAttempt: () => Promise.reject(new Error('unused')),
  attachSession: () => Promise.reject(new Error('unused')),
  transitionTask: () => Promise.reject(new Error('unused')),
  createSessionInWorkspace: () => Promise.reject(new Error('unused')),
  cleanupWorkspace: () => Promise.reject(new Error('unused')),
  onChanged: () => {},
}
it('offers the start form only for a startable task with a Lock', () => {
  const html = renderToStaticMarkup(createElement(ExecutionPanel, { t, task: pending, snapshot, selectedSession: undefined, actions }))
  expect(html).toContain(en['task.start'])
  expect(html).toContain(en['workspace.path'])
  expect(html).not.toContain(en['task.accept'])
})
it('explains a missing Lock instead of offering an unusable start button', () => {
  const html = renderToStaticMarkup(createElement(ExecutionPanel, { t, task: pending, snapshot: { ...snapshot, locks: [] }, selectedSession: undefined, actions }))
  expect(html).toContain(en['lock.empty'])
  expect(html).not.toContain(en['task.start'])
})
it('shows the running round and its agent transition', () => {
  const html = renderToStaticMarkup(createElement(ExecutionPanel, { t, task: running, snapshot, selectedSession: undefined, actions }))
  expect(html).toContain(workspace.path)
  expect(html).toContain(en['task.review'])
  expect(html).toContain(en['task.fail'])
  expect(html).toContain(en['workspace.cleanup'])
  expect(html).not.toContain(en['task.start'])
})
it('requires human confirmation from review', () => {
  const html = renderToStaticMarkup(createElement(ExecutionPanel, { t, task: { ...running, status: 'review' }, snapshot, selectedSession: undefined, actions }))
  expect(html).toContain(en['task.accept'])
  expect(html).toContain(en['task.continue'])
  expect(html).toContain(en['task.fail'])
})
