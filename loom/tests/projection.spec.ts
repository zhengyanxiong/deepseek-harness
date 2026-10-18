import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CatalogSnapshot, Lock, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-loom/types'
import { activeWorkspaceCount, boardMetrics, boundSessions, currentLock, projectLanes } from '../src/client/projection.ts'
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
