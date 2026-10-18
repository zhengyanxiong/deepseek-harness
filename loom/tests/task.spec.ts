import { describe, expect, it } from 'vitest'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'

function id<B extends string>(value: string): Branded<B> {
  return brandString<Branded<B>>(value)
}
import { attachSession, createTask, startAttempt, transitionTask, type Lock, type Workspace } from '../src/domain/task.ts'

const lock: Lock = {
  id: id('lock-a'), versionId: id('version-a'),
  repositories: [{ sourceId: id('source-a'), commit: 'a'.repeat(40) }],
}
const workspace: Workspace = { id: id('workspace-a'), lockId: lock.id, versionId: lock.versionId }
const task = () => createTask(id('task-a'), lock.versionId)
const start = () => startAttempt(task(), id('attempt-a'), lock, workspace)

describe('task execution rounds', () => {
  it('continues successive sessions in one workspace without another round', () => {
    const first = start()
    const next = attachSession(attachSession(first, id('session-a')), id('session-b'))
    expect(next.attempts).toHaveLength(1)
    expect(next.attempts[0]?.workspaceId).toBe(workspace.id)
    expect(next.attempts[0]?.sessionIds).toEqual(['session-a', 'session-b'])
    expect(first.attempts[0]?.sessionIds).toEqual([])
  })

  it('takes a detached immutable baseline at first execution', () => {
    const repositories = [{ sourceId: brandString<Lock['repositories'][number]['sourceId']>('source-a'), commit: 'a'.repeat(40) }]
    const input = { ...lock, repositories }
    const running = startAttempt(task(), id('attempt-a'), input, workspace)
    repositories[0]!.commit = 'b'.repeat(40)
    expect(running.attempts[0]?.lock.repositories[0]?.commit).toBe('a'.repeat(40))
  })

  it('refuses a second start while the task is running', () => {
    expect(() => startAttempt(start(), id('attempt-b'), lock, workspace)).toThrow('task_not_startable')
  })

  it('deduplicates session attachments', () => {
    const first = attachSession(start(), id('session-a'))
    expect(attachSession(first, id('session-a'))).toBe(first)
  })

  it('requires human confirmation of failure and completion', () => {
    expect(() => transitionTask(start(), 'failed', 'agent')).toThrow('human_confirmation_required')
    const review = transitionTask(start(), 'review', 'agent')
    expect(() => transitionTask(review, 'completed', 'agent')).toThrow('human_confirmation_required')
    expect(transitionTask(review, 'completed', 'human').status).toBe('completed')
  })

  it('preserves failed rounds when restarting on a new lock and workspace', () => {
    const failed = transitionTask(start(), 'failed', 'human')
    const nextLock = { ...lock, id: brandString<Lock['id']>('lock-b') }
    const nextWorkspace = { ...workspace, id: brandString<Workspace['id']>('workspace-b'), lockId: nextLock.id }
    const next = startAttempt(failed, id('attempt-b'), nextLock, nextWorkspace)
    expect(next.attempts).toHaveLength(2)
    expect(next.attempts[0]?.status).toBe('failed')
    expect(next.attempts[1]?.lock.id).toBe('lock-b')
    expect(failed.status).toBe('failed')
  })

  it('refuses a different version or mismatching workspace baseline', () => {
    expect(() => startAttempt(task(), id('attempt-a'), { ...lock, versionId: id('other') }, workspace)).toThrow('version_mismatch')
    expect(() => startAttempt(task(), id('attempt-a'), lock, { ...workspace, lockId: id('other') })).toThrow('workspace_mismatch')
  })

  it('refuses new sessions after completion', () => {
    const done = transitionTask(transitionTask(start(), 'review', 'agent'), 'completed', 'human')
    expect(() => attachSession(done, id('session-b'))).toThrow('task_not_active')
  })
})
