import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CatalogSnapshot, Lock, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { activeWorkspaceCount, aggregateTokenUsage, boardMetrics, boundSessions, currentLock, projectLanes, recentSessions, workspaceName } from '../src/client/projection.ts'
const projectId = brandString<ProjectRecord['id']>('p1')
const versionId = brandString<VersionRecord['id']>('v1')
const lock: Lock = { id: brandString<Lock['id']>('l1'), versionId, repositories: [{ sourceId: brandString<'loom.source'>('web'), commit: 'a'.repeat(40) }] }
const project: ProjectRecord = { id: projectId, config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo', path: 'web' }], modules: [] } }
const version: VersionRecord = { id: versionId, projectId, name: 'v1', sources: [{ sourceId: brandString<'loom.source'>('web'), ref: 'main' }] }
const task = (id: string, status: TaskRecord['status'], sessionIds: string[] = []): TaskRecord => ({ id: brandString<TaskRecord['id']>(id), versionId, title: id, status, attempts: status === 'pending' ? [] : [{ id: brandString<'loom.attempt'>('a1'), lock, workspaceId: brandString<'loom.workspace'>('w1'), sessionIds: sessionIds.map(value => brandString<'SessionId'>(value)), status: status === 'review' ? 'review' : 'running' }] })
const snapshot: CatalogSnapshot = { projects: [project], versions: [version], locks: [lock], workspaces: [{ id: brandString<'loom.workspace'>('w1'), path: '/tmp/w1', versionId, lockId: lock.id }], tasks: [task('one', 'running', ['s1']), task('two', 'review'), task('three', 'pending')] }
it('groups cards by project and keeps empty status columns', () => {
  const lanes = projectLanes(snapshot, {})
  expect(lanes).toHaveLength(1)
  expect(lanes[0]?.count).toBe(3)
  expect(lanes[0]?.columns.map(column => column.status)).toEqual(['pending', 'running', 'review', 'completed', 'failed'])
})
it('counts cards, Sessions and active workspaces', () => {
  expect(boardMetrics(snapshot, {})).toMatchObject({ cards: 3, running: 1, review: 1, activeSessions: 1 })
  expect(activeWorkspaceCount(snapshot)).toBe(1)
  expect(boundSessions(snapshot).map(row => row.sessionId)).toEqual(['s1'])
})
it('resolves the latest Lock and keeps pending tasks without one', () => {
  expect(currentLock(snapshot, snapshot.tasks[0])?.id).toBe(lock.id)
  expect(currentLock(snapshot, snapshot.tasks[2])).toBeUndefined()
})
it('filters lanes and metrics by project and version', () => {
  expect(projectLanes(snapshot, { projectId: brandString<ProjectRecord['id']>('missing') })).toEqual([])
  expect(boardMetrics(snapshot, { versionId: brandString<VersionRecord['id']>('other') }).cards).toBe(0)
})
it('filters cards by priority and module while searching descriptions', () => {
  const moduleId = brandString<'loom.module'>('api')
  const tagged: TaskRecord = { ...task('four', 'pending'), description: 'Review totals', priority: 'high', moduleIds: [moduleId] }
  const rows = { ...snapshot, tasks: [...snapshot.tasks, tagged] }
  expect(boardMetrics(rows, { priority: 'high' })).toMatchObject({ cards: 1 })
  expect(boardMetrics(rows, { priority: 'normal' }).cards).toBe(3)
  expect(boardMetrics(rows, { moduleId: 'api' }).cards).toBe(1)
  expect(boardMetrics(rows, { search: 'totals' }).cards).toBe(1)
})

it('lists only newest loose Sessions with their workspace labels', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7].map(index => ({ id: `s${String(index)}`, displayTitle: `Session ${String(index)}`, cwd: `/work/space-${String(index)}`, updatedAt: index, running: index === 7 }))
  const recent = recentSessions(rows, new Set(['s7']), '')
  expect(recent.map(row => row.id)).toEqual(['s6', 's5', 's4', 's3', 's2'])
  expect(recentSessions(rows, new Set(), 'session 3').map(row => row.id)).toEqual(['s3'])
  const labeled = recentSessions([{ id: 'x', displayTitle: 'X', cwd: '/a/b/', updatedAt: 1, running: false }], new Set(), '')
  expect(workspaceName(labeled[0]?.cwd)).toBe('b')
  expect(workspaceName(undefined)).toBeUndefined()
  expect(recentSessions([
    { id: 'blank', displayTitle: 'blank', updatedAt: 9, running: false, blank: true },
    { id: 'child', displayTitle: 'child', updatedAt: 8, running: false, origin: 'subagent' },
    { id: 'real', displayTitle: 'real', updatedAt: 7, running: false },
  ], new Set(), '').map(row => row.id)).toEqual(['real'])
})
it('aggregates provider token usage and ignores missing projections', () => {
  const first = { tokenUsage: { uncachedInputTokens: 10, outputTokens: 4, cacheReadTokens: 2, cacheWriteTokens: 1 } }
  const second = { tokenUsage: { uncachedInputTokens: 5, outputTokens: 6, cacheReadTokens: 0, cacheWriteTokens: 0 } }
  expect(aggregateTokenUsage([first, undefined, second])).toEqual({ uncachedInputTokens: 15, outputTokens: 10, cacheReadTokens: 2, cacheWriteTokens: 1 })
  expect(aggregateTokenUsage([undefined, {}])).toBeUndefined()
})
