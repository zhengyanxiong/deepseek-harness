import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LoomDiff } from '../src/client/LoomDiff.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'
const t = (key: LoomKey) => en[key]
const loadChanges = () => Promise.resolve({ ok: false as const, error: { code: 'unused' } } as never)
const renderFactorySlot = () => null
it('directs the reader to start a round when no workspace is selected', () => {
  const html = renderToStaticMarkup(createElement(LoomDiff, { t, workspaceId: undefined, loadChanges, renderFactorySlot }))
  expect(html).toContain(en['diff.workspace'])
})
it('shows the loading state before the changes settle', () => {
  const html = renderToStaticMarkup(createElement(LoomDiff, { t, workspaceId: 'w1', loadChanges, renderFactorySlot }))
  expect(html).toContain(en['diff.loading'])
})
