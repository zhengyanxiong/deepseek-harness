import { expect, it } from 'vitest'
import { failureReport, thrownFailureReport } from '../src/client/shell.ts'

it('prefers a declared Remote code over the diagnostic message', () => {
  expect(failureReport('loom/task_busy', 'task is running')).toEqual({ message: 'error.taskBusy' })
})

it('maps the current Host gateway failure through its catalog message', () => {
  expect(failureReport('gateway/internal', 'task_workspace_uncleaned')).toEqual({ message: 'error.taskWorkspaceUncleaned' })
})

it('maps the dedicated ownership rejection to its repair guidance', () => {
  expect(failureReport('gateway/internal', 'dubious_ownership: E:/repo (fatal: detected dubious ownership)')).toEqual({ message: 'error.dubiousOwnership' })
})

it('keeps an unknown Host diagnostic instead of reducing it to generic copy', () => {
  expect(failureReport('gateway/internal', 'boom')).toEqual({ message: 'delete.unknownFailure', detail: 'gateway/internal: boom' })
})

it('recognizes a client call to a delete method the running Host never mounted', () => {
  expect(thrownFailureReport(new Error('ui.remote.loom.deleteTask is not a function'))).toEqual({ message: 'error.hostNotLoaded' })
})
