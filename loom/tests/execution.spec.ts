import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { createExecution, requestExecution, requestTakeover, confirmStop, releaseExecution, ExecutionError, type ExecutionState, type ExecutionOwner } from '../src/domain/execution.ts'

const workspace = brandString<ExecutionState['workspaceId']>('workspace-a')
const a = brandString<ExecutionOwner['sessionId']>('a')
const b = brandString<ExecutionOwner['sessionId']>('b')
const c = brandString<ExecutionOwner['sessionId']>('c')
const owned = () => requestExecution(createExecution(workspace), a)
const token = (state: ExecutionState): ExecutionOwner => {
  if (!state.owner) throw new Error('test requires an owner')
  return state.owner
}
function rejects(code: string, action: () => unknown) {
  expect(action).toThrowError(ExecutionError)
  expect(action).toThrowError(code)
}

describe('workspace execution ownership', () => {
  it('grants only one owner and leaves the input unchanged', () => {
    const empty = createExecution(workspace)
    const first = requestExecution(empty, a)
    expect(empty.owner).toBeNull()
    expect(first.owner?.sessionId).toBe(a)
    expect(first.owner?.generation).toBe(1)
    expect(requestExecution(first, a)).toBe(first)
  })

  it('deduplicates waiting requests and promotes in FIFO order', () => {
    const first = owned()
    const waiting = requestExecution(requestExecution(first, b), c)
    expect(requestExecution(waiting, b)).toBe(waiting)
    expect(waiting.waiting).toEqual([b, c])
    const second = releaseExecution(waiting, token(first))
    expect(second.owner?.sessionId).toBe(b)
    expect(second.waiting).toEqual([c])
    const third = releaseExecution(second, token(second))
    expect(third.owner?.sessionId).toBe(c)
    const empty = releaseExecution(third, token(third))
    expect(empty.owner).toBeNull()
    expect(requestExecution(empty, a).owner?.generation).toBe(4)
    expect(first.waiting).toEqual([])
  })

  it('requests stopping without granting the takeover session', () => {
    const first = owned()
    const stopping = requestTakeover(first, b, token(first))
    expect(stopping.owner).toEqual(first.owner)
    expect(stopping.takeover?.sessionId).toBe(b)
    expect(requestTakeover(stopping, b, token(first))).toBe(stopping)
    rejects('takeover_pending', () => requestTakeover(stopping, c, token(first)))
    rejects('takeover_pending', () => releaseExecution(stopping, token(first)))
  })

  it('keeps unknown or failed stop outcomes blocked', () => {
    const first = owned()
    const stopping = requestTakeover(first, b, token(first))
    for (const outcome of ['unknown', 'failed'] as const) {
      const blocked = confirmStop(stopping, token(first), outcome)
      expect(blocked.owner?.sessionId).toBe(a)
      expect(blocked.takeover?.stopStatus).toBe(outcome)
      expect(requestExecution(blocked, c).owner?.sessionId).toBe(a)
    }
  })

  it('transfers only on explicit confirmed stop and preserves other waiters', () => {
    const first = requestExecution(requestExecution(owned(), c), b)
    const stopping = requestTakeover(first, b, token(first))
    const next = confirmStop(confirmStop(stopping, token(first), 'unknown'), token(first), 'stopped')
    expect(next.owner?.sessionId).toBe(b)
    expect(next.owner?.generation).toBe(2)
    expect(next.waiting).toEqual([c])
    expect(next.takeover).toBeNull()
    expect(first.waiting).toEqual([c, b])
  })

  it('rejects stale stop confirmation after the same session reacquires ownership', () => {
    const first = owned()
    const stopping = requestTakeover(first, b, token(first))
    const next = confirmStop(stopping, token(first), 'stopped')
    const reacquired = requestExecution(releaseExecution(next, token(next)), a)
    const anotherStop = requestTakeover(reacquired, c, token(reacquired))
    rejects('stale_owner', () => confirmStop(anotherStop, token(first), 'stopped'))
    rejects('stale_owner', () => releaseExecution(reacquired, token(first)))
  })

  it('checks both workspace and session on release and confirmation', () => {
    const first = owned()
    rejects('stale_owner', () => releaseExecution(first, { ...token(first), sessionId: b }))
    rejects('stale_owner', () => releaseExecution(first, { ...token(first), workspaceId: brandString<ExecutionState['workspaceId']>('other') }))
    const stopping = requestTakeover(first, b, token(first))
    rejects('stale_owner', () => confirmStop(stopping, { ...token(first), sessionId: c }, 'stopped'))
    rejects('stale_owner', () => requestTakeover(first, b, { ...token(first), sessionId: c }))
  })

  it('rejects stop confirmation without a takeover and takeover by the current owner', () => {
    const first = owned()
    rejects('no_takeover', () => confirmStop(first, token(first), 'stopped'))
    rejects('already_owner', () => requestTakeover(first, a, token(first)))
    rejects('stale_owner', () => releaseExecution(createExecution(workspace), token(first)))
  })
})
