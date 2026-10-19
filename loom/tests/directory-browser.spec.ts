/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { LoomDirectoryBrowser } from '../src/client/LoomDirectoryBrowser.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'
import type { DirectoryListing } from 'dsh-workloom/types'

const t = (key: LoomKey) => en[key]
const home: DirectoryListing = {
  path: '/home/bernie',
  home: '/home/bernie',
  crumbs: [{ name: '/', path: '/', hidden: false }, { name: 'home', path: '/home', hidden: false }, { name: 'bernie', path: '/home/bernie', hidden: false }],
  entries: [
    { name: 'workspace', path: '/home/bernie/workspace', hidden: false },
    { name: '.config', path: '/home/bernie/.config', hidden: true },
  ],
  truncated: false,
}

let root: Root | undefined
let container: HTMLDivElement | undefined
afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

it('lists host directories, navigates by row and returns the chosen path', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const workspace: DirectoryListing = { ...home, path: '/home/bernie/workspace', crumbs: [...home.crumbs, { name: 'workspace', path: '/home/bernie/workspace', hidden: false }], entries: [] }
  const loadListing = vi.fn(async (path: string | undefined) => ({ ok: true as const, value: path === '/home/bernie/workspace' ? workspace : home }))
  const onPick = vi.fn()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(LoomDirectoryBrowser, { t, loadListing, onCancel: () => {}, onPick }))
  })
  expect(loadListing).toHaveBeenCalledWith(undefined, expect.any(AbortSignal))
  expect(document.body.textContent).toContain('workspace')
  expect(document.body.textContent).not.toContain('.config')
  const row = [...document.querySelectorAll('button')].find(candidate => candidate.textContent === 'workspace')
  if (row === undefined) throw new Error('workspace directory row is missing')
  await act(async () => { row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  expect(loadListing).toHaveBeenLastCalledWith('/home/bernie/workspace', expect.any(AbortSignal))
  const select = [...document.querySelectorAll('button')].find(candidate => candidate.textContent === en['directory.select'])
  if (select === undefined) throw new Error('directory select button is missing')
  await act(async () => { select.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  expect(onPick).toHaveBeenCalledWith('/home/bernie/workspace')
})
