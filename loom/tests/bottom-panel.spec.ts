import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LoomBottomPanel } from '../src/client/LoomBottomPanel.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'
const t = (key: LoomKey) => en[key]
const props = {
  t, collapsed: false, height: 170, pane: 'diff' as const, audit: [], diffCount: 0, usage: undefined,
  workspaceId: 'w1', loadChanges: () => Promise.reject(new Error('unused')),
  wrap: false, onToggleWrap: () => {},
  onToggle: () => {}, onPane: () => {},
}
it('offers a full-window Diff from the bottom Diff pane', () => {
  const html = renderToStaticMarkup(createElement(LoomBottomPanel, props))
  expect(html).toContain(en['diff.expand'])
  expect(html).toContain(en['diff.loading'])
})
it('leaves other panes without the Diff-only control', () => {
  const html = renderToStaticMarkup(createElement(LoomBottomPanel, { ...props, pane: 'audit' }))
  expect(html).not.toContain(en['diff.expand'])
})
