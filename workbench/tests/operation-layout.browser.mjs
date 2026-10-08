import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url))
const { chromium } = require('playwright')
const { transform } = require('lightningcss')

const file = new URL('../src/client/WorkbenchPanel.module.css', import.meta.url)
const { code, exports: names } = transform({
  filename: file.pathname,
  code: await readFile(file),
  cssModules: { pattern: '[hash]_[local]' },
  minify: true,
})

test('opening an operation keeps its right panel inside the visible workbench', async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    await page.setContent(`<style>${code.toString()}</style><section class="${names.page.name} ${names.operationsPage.name}" style="--workbench-operation-width: 475px"><aside class="${names.operationSurface.name}">Operation form</aside></section>`)
    const bounds = await page.evaluate(selectors => {
      const root = document.querySelector(selectors.root).getBoundingClientRect()
      const panel = document.querySelector(selectors.panel).getBoundingClientRect()
      return { rootRight: root.right, panelRight: panel.right, viewportRight: innerWidth }
    }, { root: `.${names.page.name}`, panel: `.${names.operationSurface.name}` })
    assert.ok(bounds.rootRight <= bounds.viewportRight, `page overflows right: ${JSON.stringify(bounds)}`)
    assert.ok(bounds.panelRight <= bounds.viewportRight, `panel is out of view: ${JSON.stringify(bounds)}`)
  } finally {
    await browser.close()
  }
})
