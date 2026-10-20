import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissLoomNotice, getLoomNotices, pushLoomNotice, reportLoomFailure, subscribeLoomNotices } from '../src/client/feedback.ts'
import type { LoomKey } from '../src/client/locales.ts'

const t = (key: LoomKey): string => `t:${key}`

beforeEach(() => {
  vi.useFakeTimers()
  for (const notice of getLoomNotices()) dismissLoomNotice(notice.id)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('operation notices', () => {
  it('holds a success for 2.8 seconds and an error for 6 seconds', () => {
    pushLoomNotice('success', 'saved')
    pushLoomNotice('error', 'failed', 'detail')
    expect(getLoomNotices().map(notice => notice.tone)).toEqual(['success', 'error'])
    vi.advanceTimersByTime(2_799)
    expect(getLoomNotices()).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(getLoomNotices().map(notice => notice.title)).toEqual(['failed'])
    vi.advanceTimersByTime(6_000)
    expect(getLoomNotices()).toHaveLength(0)
  })

  it('keeps only the newest three notices', () => {
    for (const title of ['one', 'two', 'three', 'four']) pushLoomNotice('success', title)
    expect(getLoomNotices().map(notice => notice.title)).toEqual(['two', 'three', 'four'])
  })

  it('notifies subscribers and allows an immediate dismissal', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeLoomNotices(listener)
    pushLoomNotice('error', 'failed')
    expect(listener).toHaveBeenCalledTimes(1)
    dismissLoomNotice(getLoomNotices()[0]?.id ?? 0)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(getLoomNotices()).toHaveLength(0)
    unsubscribe()
    pushLoomNotice('success', 'saved')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('localizes a known failure and keeps an unknown diagnostic', () => {
    reportLoomFailure(t, { code: 'gateway/internal', message: 'task_busy' })
    reportLoomFailure(t, { code: 'gateway/internal', message: 'boom' })
    expect(getLoomNotices().map(notice => [notice.title, notice.detail])).toEqual([
      ['t:notice.operationFailed', 't:error.taskBusy'],
      ['t:notice.operationFailed', 't:delete.unknownFailure · gateway/internal: boom'],
    ])
  })
})
