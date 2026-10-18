import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LoomFileRow } from '../src/client/LoomFileRow.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'
const t = (key: LoomKey) => en[key]
it('draws one single-line file row with Git-style counts at the end', () => {
  const html = renderToStaticMarkup(createElement(LoomFileRow, {
    display: 'src/client/LoomPanel.tsx', title: 'src/client/LoomPanel.tsx', added: 12, deleted: 4,
    t, selected: true, onClick: () => {},
  }))
  expect(html).toContain('src/client/LoomPanel.tsx')
  expect(html).toContain('+12')
  expect(html).toContain('−4')
  expect(html).toContain('align-items:center')
  expect(html).not.toContain('flex-direction:column')
  expect(html).toContain('--dsw-alias-state-success-primary')
  expect(html).toContain('--dsw-alias-state-error-primary')
  expect(html).toContain('aria-pressed="true"')
})
it('draws binary files with the non-text label', () => {
  const html = renderToStaticMarkup(createElement(LoomFileRow, {
    display: 'assets/logo.png', added: 0, deleted: 0, binary: true, t, selected: false, onClick: () => {},
  }))
  expect(html).toContain(en['review.binary'])
})
