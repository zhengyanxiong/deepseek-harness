// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { LoomReviewPreview } from '../src/client/LoomReviewPreview.tsx'
import { en } from '../src/client/locales.ts'

// React's act() requires the DOM test flag; Vitest does not set it for a plain jsdom file.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const summary = {
  turn: 2, total: 2, added: 3, deleted: 1,
  files: [
    { path: 'src/a.ts', display: 'src/a.ts', added: 2, deleted: 1 },
    { path: 'src/b.ts', display: 'src/b.ts', added: 1, deleted: 0 },
  ],
}
const diff = {
  kind: 'text', path: 'src/b.ts', display: 'src/b.ts', before: true, after: true, coarse: false,
  hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-const b = 1', '+const b = 2'] }],
}
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })
it('loads the turn summary and the selected native comparison', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
    url.includes('changes.summary') ? Response.json(summary) : Response.json(diff),
  )))
  const states: string[] = []
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(LoomReviewPreview, {
      t: (key: keyof typeof en) => en[key], sessionId: 's1', seq: 9, initialIndex: 1,
      renderFactorySlot: (_name, props) => {
        const kind = typeof props.state === 'string' ? props.state : props.state.kind
        states.push(kind)
        return createElement('div', { 'data-diff-state': kind })
      },
    }))
  })
  await act(async () => {
    await vi.waitFor(() => { expect(container.textContent).toContain('src/b.ts') })
  })
  expect(container.textContent).toContain(en['review.fileList'])
  expect(states).toContain('text')
  await act(async () => { root.unmount() })
})
