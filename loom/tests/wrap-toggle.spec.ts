/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { WorkspaceRepositoryChangesRecord } from 'dsh-workloom/types'
import { LoomDiff } from '../src/client/LoomDiff.tsx'
import { LoomWrapToggle } from '../src/client/LoomWrapToggle.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'

const t = (key: LoomKey) => en[key]
let root: Root | undefined
let container: HTMLDivElement | undefined

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

const repositories: WorkspaceRepositoryChangesRecord[] = [{
  repo: 'web',
  directory: '/tmp/web',
  files: [{ path: 'src/a.ts', added: 1, deleted: 0, binary: false, before: false, after: true, hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, lines: ['+const a = 1'] }] }],
}]

it('reports the wrap state to assistive technology and names the action it performs', () => {
  const off = renderToStaticMarkup(createElement(LoomWrapToggle, { t, wrap: false, onToggle: () => {} }))
  expect(off).toContain(`aria-label="${en['diff.wrapAria']}"`)
  expect(off).toContain('aria-pressed="false"')
  expect(off).toContain('data-loom-wrap="off"')
  const on = renderToStaticMarkup(createElement(LoomWrapToggle, { t, wrap: true, onToggle: () => {} }))
  expect(on).toContain('aria-pressed="true"')
  expect(on).toContain('data-loom-wrap="on"')
})

it('asks for the opposite wrap state when pressed', async () => {
  const onToggle = vi.fn()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(createElement(LoomWrapToggle, { t, wrap: false, onToggle })) })
  const control = container.querySelector('button')
  if (control === null) throw new Error('the wrap switch is missing')
  await act(async () => { control.click() })
  expect(onToggle).toHaveBeenCalledTimes(1)
})

it('draws the comparison in a bounded viewport with the current wrap state', async () => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(LoomDiff, {
      t, workspaceId: 'w1', wrap: true, onToggleWrap: () => {},
      loadChanges: () => Promise.resolve({ ok: true as const, value: { repositories } }),
    }))
  })
  await act(async () => { await vi.waitFor(() => { expect(container?.textContent).toContain('const a = 1') }) })
  const viewport = container.querySelector('[data-loom-diff-viewport]')
  expect(viewport?.getAttribute('style')).toMatch(/flex-direction:\s*column/u)
  expect(container.querySelector('[role="table"]')).not.toBeNull()
  expect(container.textContent).not.toContain(en['integrationUnavailable'])
})
