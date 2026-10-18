import { expect, it } from 'vitest'
import { previewTargetFromAddress } from '../src/client/preview.ts'
it('reads a native session file address for the workbench preview', () => {
  expect(previewTargetFromAddress('dsh-resource://file/session/s1/src/a%20b.ts')).toEqual({ sessionId: 's1', path: 'src/a b.ts' })
})
it('leaves non-session resources to the native right Sidebar', () => {
  expect(previewTargetFromAddress('dsh-resource://file/absolute/tmp/a.ts')).toBeUndefined()
  expect(previewTargetFromAddress('dsh-resource://file/session/s1/')).toBeUndefined()
  expect(previewTargetFromAddress('https://example.com')).toBeUndefined()
})
