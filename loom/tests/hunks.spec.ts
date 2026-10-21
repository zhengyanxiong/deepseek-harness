import { expect, it } from 'vitest'
import { hunkRows } from '../src/client/LoomHunks.tsx'

it('numbers unified diff rows by hunk position', () => {
  expect(hunkRows([{ oldStart: 2, oldLines: 2, newStart: 2, newLines: 2, lines: [' keep', '-old', '+new', '\\ No newline at end of file'] }])).toEqual([
    { kind: 'context', oldLine: 2, newLine: 2, text: 'keep' },
    { kind: 'del', oldLine: 3, newLine: undefined, text: 'old' },
    { kind: 'add', oldLine: undefined, newLine: 3, text: 'new' },
  ])
})
