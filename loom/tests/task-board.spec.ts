import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LoomKanban } from '../src/client/LoomKanban.tsx'
import { TaskBoard } from '../src/client/TaskBoard.tsx'
import { en } from '../src/client/locales.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { BoardTask } from '../src/client/board.ts'
import type { CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
it('renders five labeled business columns and a real task selection button', () => {
  const task: BoardTask = { id: brandString<BoardTask['id']>('t1'), versionId: brandString<BoardTask['versionId']>('v1'), title: '<Checkout>', status: 'pending', attempts: [] }
  const html = renderToStaticMarkup(createElement(TaskBoard, { tasks: [task], filter: {}, t: key => en[key], onSelect: () => {} }))
  for (const label of ['Pending', 'Running', 'In review', 'Completed', 'Failed']) expect(html).toContain(label)
  expect(html).toContain('&lt;Checkout&gt;')
  expect(html).toContain('<button')
})

it('pulses only cards whose bound native Session is live', () => {
  const project: ProjectRecord = { id: brandString<ProjectRecord['id']>('p1'), config: { name: 'Shop', sources: [], modules: [] } }
  const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v1', sources: [] }
  const running: TaskRecord = { id: brandString<TaskRecord['id']>('t1'), versionId: version.id, title: 'Checkout', status: 'running', attempts: [] }
  const idle: TaskRecord = { id: brandString<TaskRecord['id']>('t2'), versionId: version.id, title: 'Docs', status: 'running', attempts: [] }
  const snapshot: CatalogSnapshot = { projects: [project], versions: [version], locks: [], tasks: [running, idle], workspaces: [], temporarySessions: [], audit: [], executions: [] }
  const render = (live: ReadonlySet<string>): string => renderToStaticMarkup(createElement(LoomKanban, {
    t: key => en[key], snapshot, liveTaskIds: live, filter: {}, mode: 'flat',
    projectValue: '', versionValue: '', priorityValue: '', moduleValue: '', searchValue: '',
    onMode: () => undefined, onProject: () => undefined, onVersion: () => undefined, onPriority: () => undefined,
    onModule: () => undefined, onSearch: () => undefined, onSelect: () => undefined, onMove: () => undefined, onNewCard: () => undefined,
  }))
  expect(render(new Set([running.id]))).toContain('loom-kb-card-running')
  expect(render(new Set())).not.toContain('loom-kb-card-running')
})
