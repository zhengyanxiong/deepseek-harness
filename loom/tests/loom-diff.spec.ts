import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { WorkspaceRepositoryChangesRecord } from 'dsh-loom/types'
import { buildDiffTrees, diffTreeFiles, LoomDiff } from '../src/client/LoomDiff.tsx'
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
it('groups changed files into sorted repository and directory trees', () => {
  const file = (path: string, added: number): WorkspaceRepositoryChangesRecord['files'][number] => ({ path, added, deleted: 0, binary: false, before: true, after: true, hunks: [] })
  const repositories: WorkspaceRepositoryChangesRecord[] = [{ repo: 'web', directory: '/tmp/web', files: [file('src/z.ts', 2), file('src/a.ts', 1), file('README.md', 3)] }]
  const trees = buildDiffTrees(repositories)
  expect(trees.map(tree => tree.name)).toEqual(['web'])
  expect(trees[0]!.directories.map(directory => directory.name)).toEqual(['src'])
  expect(trees[0]!.directories[0]!.files.map(entry => entry.file.path)).toEqual(['src/a.ts', 'src/z.ts'])
  expect(diffTreeFiles(trees).map(entry => entry.file.path)).toEqual(['src/a.ts', 'src/z.ts', 'README.md'])
})
