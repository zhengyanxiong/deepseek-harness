// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { WorkspaceRepositoryChangesRecord } from 'dsh-workloom/types'
import { LoomDiff } from '../src/client/LoomDiff.tsx'
import { en } from '../src/client/locales.ts'

// React's act() requires the DOM test flag; Vitest does not set it for a plain jsdom file.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const t = (key: keyof typeof en) => en[key]
const changes: readonly WorkspaceRepositoryChangesRecord[] = [{
  repo: 'repo',
  directory: '/tmp/repo',
  files: [{
    path: 'src/a.ts', added: 2, deleted: 1, binary: false, before: true, after: true,
    hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-const a = 1', '+const a = 2'] }],
  }],
}]

afterEach(() => { document.body.innerHTML = '' })

it('keeps the change tree collapsed until a directory is expanded', async () => {
  const onChangesCount = vi.fn()
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(LoomDiff, {
      t, workspaceId: 'w1',
      loadChanges: () => Promise.resolve({ ok: true, value: { repositories: changes } }),
      onChangesCount, wrap: false, onToggleWrap: () => {},
    }))
  })
  await act(async () => {
    await vi.waitFor(() => { expect(container.textContent).toContain('repo') })
  })
  expect(onChangesCount).toHaveBeenCalledWith(1)
  expect(container.querySelectorAll('button[aria-expanded]')).toHaveLength(1)
  expect(container.textContent).not.toContain('src')
  expect(container.textContent).not.toContain('a.ts')

  await act(async () => {
    container.querySelector<HTMLButtonElement>('button[aria-expanded]')?.click()
  })
  expect(container.textContent).toContain('src')
  expect(container.textContent).not.toContain('a.ts')

  const directory = [...container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find(button => button.textContent?.includes('src'))
  await act(async () => { directory?.click() })
  expect(container.textContent).toContain('a.ts')
  await act(async () => { root.unmount() })
})
