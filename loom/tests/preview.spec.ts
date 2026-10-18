import { expect, it } from 'vitest'
import {
  openFilePreview, openReviewPreview, previewTargetFromAddress, reviewIndexFromOptions, reviewTargetFromAddress,
  workspacePreview, workspaceReviewPreview,
} from '../src/client/preview.ts'
it('reads a native session file address for the workbench preview', () => {
  expect(previewTargetFromAddress('dsh-resource://file/session/s1/src/a%20b.ts')).toEqual({ sessionId: 's1', path: 'src/a b.ts' })
})
it('leaves non-session resources to the native right Sidebar', () => {
  expect(previewTargetFromAddress('dsh-resource://file/absolute/tmp/a.ts')).toBeUndefined()
  expect(previewTargetFromAddress('dsh-resource://file/session/s1/')).toBeUndefined()
  expect(previewTargetFromAddress('https://example.com')).toBeUndefined()
})

it('reads a native changed-files review address and its file index', () => {
  expect(reviewTargetFromAddress('dsh-resource://changes-review/session/s1/9/2')).toEqual({ sessionId: 's1', seq: 9, turn: 2 })
  expect(reviewTargetFromAddress('dsh-resource://changes-review/session/s1/9/2', 3)).toEqual({ sessionId: 's1', seq: 9, turn: 2, index: 3 })
  expect(reviewTargetFromAddress('dsh-resource://changes-review/session/s1/9/0')).toBeUndefined()
  expect(reviewTargetFromAddress('dsh-resource://file/session/s1/a.ts')).toBeUndefined()
  expect(reviewIndexFromOptions({ params: { index: 3 } })).toBe(3)
  expect(reviewIndexFromOptions({ params: { index: -1 } })).toBeUndefined()
  expect(reviewIndexFromOptions(undefined)).toBeUndefined()
})
it('shows one aside at a time', () => {
  openFilePreview({ sessionId: 's1', path: 'src/a.ts' })
  expect(workspacePreview.getSnapshot()?.path).toBe('src/a.ts')
  expect(workspaceReviewPreview.getSnapshot()).toBeUndefined()
  openReviewPreview({ sessionId: 's1', seq: 9, turn: 2 })
  expect(workspacePreview.getSnapshot()).toBeUndefined()
  expect(workspaceReviewPreview.getSnapshot()?.turn).toBe(2)
  workspaceReviewPreview.close()
})
