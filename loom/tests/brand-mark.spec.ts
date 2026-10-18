import { readFileSync } from 'node:fs'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LoomBrandMark, LoomMark } from '../src/client/LoomMark.tsx'

it('draws the sidebar monogram at the requested size in the inherited color', () => {
  const html = renderToStaticMarkup(createElement(LoomMark, { size: 18 }))
  expect(html).toContain('width="18"')
  expect(html).toContain('height="18"')
  expect(html).toContain('stroke="currentColor"')
  expect(html).toContain('aria-hidden="true"')
})

it('gives each colored brand mark its own gradient identifiers', () => {
  const html = renderToStaticMarkup(createElement(Fragment, null,
    createElement(LoomBrandMark, { size: 22 }),
    createElement(LoomBrandMark, { size: 36 }),
  ))
  const ids = [...html.matchAll(/id="(loom_(?:left|right)_[^"]+)"/gu)].map(match => match[1])
  expect(ids).toHaveLength(4)
  expect(new Set(ids).size).toBe(4)
  expect(html).toContain('stop-color="#A78BFA"')
  expect(html).toContain('stop-color="#2DD4BF"')
})

it('ships plugin artwork on the standard 36-unit canvas', () => {
  const icon = readFileSync(new URL('../icon.svg', import.meta.url), 'utf8')
  expect(icon).toContain('viewBox="0 0 36 36"')
  expect(icon).not.toContain('<script')
  expect(icon).not.toContain('href=')
})
