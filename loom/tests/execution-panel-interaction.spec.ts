/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { brandNumber, brandString } from '@deepseek-ai/dsh-brand'
import { ExecutionPanel, type ExecutionActions } from '../src/client/LoomExecution.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'
import type { CatalogSnapshot, Lock, TaskRecord, VersionRecord, WorkspaceRecord } from 'dsh-workloom/types'

const t = (key: LoomKey) => en[key]
const versionId = brandString<VersionRecord['id']>('v1')
const lock: Lock = { id: brandString<Lock['id']>('lock1'), versionId, repositories: [{ sourceId: brandString<'loom.source'>('web'), commit: 'a'.repeat(40) }] }
const workspace: WorkspaceRecord = { id: brandString<WorkspaceRecord['id']>('w1'), versionId, lockId: lock.id, path: '/tmp/loom/workspace' }
const task: TaskRecord = {
  id: brandString<TaskRecord['id']>('t1'), versionId, title: 'Checkout', status: 'running',
  attempts: [{ id: brandString<'loom.attempt'>('a1'), lock, workspaceId: workspace.id, sessionIds: [brandString<'SessionId'>('s1')], status: 'running' }],
}
const owner = { workspaceId: workspace.id, sessionId: brandString<'SessionId'>('s2'), generation: brandNumber<'loom.execution-generation'>(1) }
const snapshot: CatalogSnapshot = {
  projects: [],
  versions: [{ id: versionId, projectId: brandString<'loom.project'>('p1'), name: 'v1', sources: [{ sourceId: lock.repositories[0]!.sourceId, ref: 'main' }] }],
  locks: [lock],
  tasks: [task],
  workspaces: [workspace],
  temporarySessions: [],
  audit: [],
  executions: [{ workspaceId: workspace.id, generation: owner.generation, owner, waiting: [brandString<'SessionId'>('s1')], takeover: null }],
}
const unused = () => Promise.reject(new Error('unused'))
const actions: ExecutionActions = {
  prepareWorkspace: unused, startAttempt: unused, attachSession: unused, transitionTask: unused,
  createSessionInWorkspace: unused, cleanupWorkspace: unused, acquireExecution: unused, releaseExecution: unused,
  takeoverExecution: unused, onSession: () => {}, onChanged: () => {},
}

let root: Root | undefined
let container: HTMLDivElement | undefined
afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

it('opens the takeover warning as a modal and closes it without taking over', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(ExecutionPanel, {
      t, task, snapshot, selectedSession: undefined, actions,
      loadChanges: unused, wrap: false, onToggleWrap: () => {},
    }))
  })
  const button = (label: string): HTMLButtonElement => {
    const found = [...document.querySelectorAll('button')].find(candidate => candidate.textContent === label)
    if (found === undefined) throw new Error(`button ${label} is missing`)
    return found
  }
  await act(async () => { button(en['execution.takeover']).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]')
  expect(dialog?.getAttribute('aria-label')).toBe(en['execution.takeover'])
  expect(dialog?.textContent).toContain(en['execution.takeoverWarning'])
  await act(async () => { button(en['form.cancel']).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  expect(document.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull()
})
