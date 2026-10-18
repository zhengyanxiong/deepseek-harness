import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LoomFilePreview } from '../src/client/LoomFilePreview.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'

const t = (key: LoomKey) => en[key]

it('offers Diff and File tabs before any workspace is selected', () => {
  const html = renderToStaticMarkup(createElement(LoomFilePreview, {
    t, workspaceId: undefined, sessionId: undefined, filePath: 'src/a.ts',
    loadChanges: () => Promise.reject(new Error('unused')), renderFactorySlot: () => null,
    readFile: () => Promise.reject(new Error('unused')),
  }))
  expect(html).toContain(en['diff.tabDiff'])
  expect(html).toContain(en['diff.tabFile'])
  expect(html).toContain(en['diff.workspace'])
})
