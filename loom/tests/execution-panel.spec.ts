import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandNumber, brandString } from '@deepseek-ai/dsh-brand'
import { ExecutionPanel, type ExecutionActions } from '../src/client/LoomExecution.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'
import { failureKey } from '../src/client/shell.ts'
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
  audit: [],
  executions: [],
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
  acquireExecution: () => Promise.reject(new Error('unused')),
  releaseExecution: () => Promise.reject(new Error('unused')),
  takeoverExecution: () => Promise.reject(new Error('unused')),
  onSession: () => {},
  onChanged: () => {},
}
it('offers the start form only for a startable task with a Lock', () => {
  const html = renderToStaticMarkup(createElement(ExecutionPanel, { t, task: pending, snapshot, selectedSession: undefined, actions }))
  expect(html).toContain(en['task.start'])
  expect(html).toContain(en['workspace.auto'])
  expect(html).toContain(en['workspace.custom'])
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

it('shows waiting and takeover controls when another Session owns the workspace', () => {
  const owner = { workspaceId: workspace.id, sessionId: brandString<'SessionId'>('s2'), generation: brandNumber<'loom.execution-generation'>(1) }
  const withExecution: CatalogSnapshot = {
    ...snapshot,
    executions: [{ workspaceId: workspace.id, generation: brandNumber<'loom.execution-generation'>(1), owner, waiting: [brandString<'SessionId'>('s1')], takeover: null }],
  }
  const html = renderToStaticMarkup(createElement(ExecutionPanel, { t, task: running, snapshot: withExecution, selectedSession: undefined, actions }))
  expect(html).toContain(en['execution.owner'])
  expect(html).toContain(en['execution.waiting'])
  expect(html).toContain(en['execution.takeover'])
  expect(html).not.toContain(en['execution.release'])
})
it('shows release for the owning Session', () => {
  const owner = { workspaceId: workspace.id, sessionId: brandString<'SessionId'>('s1'), generation: brandNumber<'loom.execution-generation'>(2) }
  const withExecution: CatalogSnapshot = {
    ...snapshot,
    executions: [{ workspaceId: workspace.id, generation: brandNumber<'loom.execution-generation'>(2), owner, waiting: [], takeover: null }],
  }
  const html = renderToStaticMarkup(createElement(ExecutionPanel, { t, task: running, snapshot: withExecution, selectedSession: undefined, actions }))
  expect(html).toContain(en['execution.release'])
  expect(html).not.toContain(en['execution.wait'])
})

it('offers a failed task its retained matching workspace for a new attempt', () => {
  const failed: TaskRecord = {
    ...pending,
    status: 'failed',
    attempts: [{ id: brandString<'loom.attempt'>('a1'), lock, workspaceId: workspace.id, sessionIds: [], status: 'failed' }],
  }
  const html = renderToStaticMarkup(createElement(ExecutionPanel, { t, task: failed, snapshot, selectedSession: undefined, actions }))
  expect(html).toContain(en['workspace.reuse'])
  expect(html).toContain(en['task.start'])
})
it('does not offer reuse after the previous workspace was cleaned', () => {
  const failed: TaskRecord = {
    ...pending,
    status: 'failed',
    attempts: [{ id: brandString<'loom.attempt'>('a1'), lock, workspaceId: workspace.id, sessionIds: [], status: 'failed' }],
  }
  const html = renderToStaticMarkup(createElement(ExecutionPanel, {
    t, task: failed, selectedSession: undefined, actions,
    snapshot: { ...snapshot, workspaces: [{ ...workspace, cleaned: true }] },
  }))
  expect(html).not.toContain(en['workspace.reuse'])
})

it('acts for the selected Session rather than the task’s last attached Session', () => {
  const owner = { workspaceId: workspace.id, sessionId: brandString<'SessionId'>('s1'), generation: brandNumber<'loom.execution-generation'>(1) }
  const withExecution: CatalogSnapshot = {
    ...snapshot,
    executions: [{ workspaceId: workspace.id, generation: brandNumber<'loom.execution-generation'>(1), owner, waiting: [], takeover: null }],
  }
  const html = renderToStaticMarkup(createElement(ExecutionPanel, {
    t, task: running, snapshot: withExecution, selectedSession: brandString<'SessionId'>('s2'), actions,
  }))
  expect(html).toContain(en['execution.takeover'])
  expect(html).not.toContain(en['execution.release'])
})

it('explains known workspace failures instead of only showing a code', () => {
  expect(failureKey('existing_root')).toBe('error.existingRoot')
  expect(failureKey('workspace_path_registered')).toBe('error.pathRegistered')
  expect(failureKey('existing_root; rollback: failed')).toBe('error.existingRoot')
  expect(failureKey('unmapped_failure')).toBeUndefined()
})
