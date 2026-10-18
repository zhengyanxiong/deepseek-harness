import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { TaskRecord } from '../src/host/catalog.ts'
import { projectBoard } from '../src/client/board.ts'
import { canMoveTask } from '../src/client/shell.ts'
const task = (id: string, title: string, status: TaskRecord['status'], version = 'v1'): TaskRecord => ({ id: brandString<TaskRecord['id']>(id), versionId: brandString<TaskRecord['versionId']>(version), title, status, attempts: [] })
it('keeps all five business-state columns including empty ones', () => {
  const board = projectBoard([task('t1', 'Checkout', 'running')], {})
  expect(board.map(column => column.status)).toEqual(['pending', 'running', 'review', 'completed', 'failed'])
  expect(board.map(column => column.tasks.length)).toEqual([0, 1, 0, 0, 0])
})
it('filters by fixed version and case-insensitive task title', () => {
  const tasks = [task('t1', 'Checkout', 'running'), task('t2', 'Checkout API', 'pending', 'v2'), task('t3', 'Docs', 'review')]
  const columns = projectBoard(tasks, { versionId: tasks[0]!.versionId, search: ' CHECK ' })
  expect(columns.flatMap(column => column.tasks).map(row => row.id)).toEqual(['t1'])
  expect(tasks).toHaveLength(3)
})
it('does not infer task status from session or execution state', () => {
  expect(projectBoard([task('t', 'Review', 'review')], {})[2]?.tasks[0]?.status).toBe('review')
})

it('allows only review-flow drag transitions that do not allocate a new round', () => {
  expect(canMoveTask('running', 'review')).toBe(true)
  expect(canMoveTask('running', 'failed')).toBe(true)
  expect(canMoveTask('review', 'running')).toBe(true)
  expect(canMoveTask('review', 'completed')).toBe(true)
  expect(canMoveTask('review', 'failed')).toBe(true)
  for (const [from, to] of [['pending', 'running'], ['running', 'completed'], ['completed', 'review'], ['failed', 'running'], ['running', 'running']] as const) expect(canMoveTask(from, to)).toBe(false)
})
