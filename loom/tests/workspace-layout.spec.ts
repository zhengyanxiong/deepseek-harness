import { expect, it } from 'vitest'
import { admitWorkspaceLayout, type WorkspaceLayout } from '../src/domain/workspace.ts'

let sequence = 0
const binding = (path: string, kind: WorkspaceLayout['repositories'][number]['kind']) => ({ sourceId: `s${String(sequence += 1)}`, path, targetPath: '/repos/x', kind }) as WorkspaceLayout['repositories'][number]

it('admits single-repository managed and direct layouts at the root', () => {
  expect(() => admitWorkspaceLayout({ projectId: 'p' as never, mode: 'managed', rootPath: '/ws', rootOwner: 'loom', repositories: [binding('.', 'worktree')] })).not.toThrow()
  expect(() => admitWorkspaceLayout({ projectId: 'p' as never, mode: 'direct', rootPath: '/ws', rootOwner: 'user', repositories: [binding('.', 'direct')] })).not.toThrow()
})

it('admits multi-repository layouts and rejects duplicate or overlapping paths', () => {
  expect(() => admitWorkspaceLayout({ projectId: 'p' as never, mode: 'linked', rootPath: '/ws', rootOwner: 'loom', repositories: [binding('web', 'link'), binding('api', 'link')] })).not.toThrow()
  expect(() => admitWorkspaceLayout({ projectId: 'p' as never, mode: 'linked', rootPath: '/ws', rootOwner: 'loom', repositories: [binding('web', 'link'), binding('web/deep', 'link')] })).toThrow('overlapping_paths')
})

it('rejects a linked binding at the container root', () => {
  expect(() => admitWorkspaceLayout({ projectId: 'p' as never, mode: 'linked', rootPath: '/ws', rootOwner: 'loom', repositories: [binding('.', 'link')] })).toThrow('invalid_path')
})
