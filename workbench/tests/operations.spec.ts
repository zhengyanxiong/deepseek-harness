import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyOperationDraft, reminderInstant, validateOperation } from '../src/client/operations/operations.ts'

test('independent form drafts do not share edits', () => {
  const a = emptyOperationDraft(), b = emptyOperationDraft()
  a.content = 'Retain this draft'
  assert.equal(b.content, '')
})
test('empty requests cannot be staged', () => {
  for (const kind of ['new-session', 'run-workflow', 'new-job', 'add-todo', 'set-reminder'] as const) {
    assert.equal(validateOperation(kind, emptyOperationDraft(), 0), 'content')
  }
})
test('reminders reject normalized calendar dates and past times', () => {
  const draft = { ...emptyOperationDraft(), content: 'Check', date: '2026-02-30', time: '09:00' }
  assert.equal(reminderInstant(draft), undefined)
  draft.date = '2026-10-07'
  assert.ok(reminderInstant(draft))
  assert.equal(validateOperation('set-reminder', draft, new Date('2027-01-01').getTime()), 'time')
  assert.equal(validateOperation('set-reminder', draft, 0), undefined)
})
