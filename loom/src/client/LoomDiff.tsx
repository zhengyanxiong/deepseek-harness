/** Changed-file tree and native comparison over one attempt workspace. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import {
  IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconFolderCloseRegular, IconFolderOpenRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  WorkspaceChangesRequest, WorkspaceFileChangeRecord, WorkspaceRepositoryChangesRecord,
} from 'dsh-workloom/types'
import { LoomFileCounts, LoomFileRow } from './LoomFileRow.tsx'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** The native factory's caller input, structurally identical to its declaration. */
export interface NativeFileDiffInput {
  state: 'missing' | 'error' | 'loading' | { kind: 'binary' } | { kind: 'oversized' } | { kind: 'text'; path: string; display: string; before: boolean; after: boolean; coarse: boolean; hunks: readonly WorkspaceFileChangeRecord['hunks'][number][] }
  split: boolean
  wrap: boolean
  retry: () => void
}

/** The Factory-render share of the slot props. */
export type RenderFileDiffSlot = (name: 'deliverables.fileDiff', props: NativeFileDiffInput, options?: { fallback?: ReactNode }) => ReactNode

/** Changes read for one workspace. */
export type LoadWorkspaceChanges = (request: WorkspaceChangesRequest) => Promise<RemoteResult<{ repositories: WorkspaceRepositoryChangesRecord[] }>>

/** One changed file in a repository tree. */
export interface DiffTreeFile {
  readonly repo: string
  readonly file: WorkspaceFileChangeRecord
  readonly key: string
}

/** One directory or repository root in the changed-file tree. */
export interface DiffTreeDirectory {
  readonly name: string
  readonly path: string
  readonly directories: readonly DiffTreeDirectory[]
  readonly files: readonly DiffTreeFile[]
}

interface MutableTree {
  name: string
  path: string
  directories: MutableTree[]
  files: DiffTreeFile[]
}

function fileCount(node: DiffTreeDirectory): number {
  return node.files.length + node.directories.reduce((total, child) => total + fileCount(child), 0)
}

function sortTree(node: MutableTree): void {
  node.directories.sort((left, right) => left.name.localeCompare(right.name))
  node.files.sort((left, right) => left.file.path.localeCompare(right.file.path))
  for (const child of node.directories) sortTree(child)
}

/**
 * Group repository changes into sorted directory trees rooted at each repository.
 * @param repositories - working-tree changes read for one workspace.
 * @returns one root per repository, with nested directories and changed files.
 */
export function buildDiffTrees(repositories: readonly WorkspaceRepositoryChangesRecord[]): readonly DiffTreeDirectory[] {
  return repositories.map((repository, repoIndex) => {
    const segments = repository.repo.split(/[\\/]/u).filter(Boolean)
    const root: MutableTree = { name: segments.at(-1) ?? repository.repo, path: `${String(repoIndex)}:${repository.repo}`, directories: [], files: [] }
    for (const file of repository.files) {
      const parts = file.path.split('/').filter(Boolean)
      parts.pop()
      let directory = root
      for (const part of parts) {
        let child = directory.directories.find(candidate => candidate.name === part)
        if (child === undefined) {
          child = { name: part, path: `${directory.path}/${part}`, directories: [], files: [] }
          directory.directories.push(child)
        }
        directory = child
      }
      directory.files.push({ repo: repository.repo, file, key: `${String(repoIndex)}:${file.path}` })
    }
    sortTree(root)
    return root
  })
}

/**
 * Flatten a changed-file tree in display order.
 * @param trees - repository trees.
 * @returns every changed file exactly once.
 */
export function diffTreeFiles(trees: readonly DiffTreeDirectory[]): readonly DiffTreeFile[] {
  return trees.flatMap(node => [...node.directories.flatMap(child => diffTreeFiles([child])), ...node.files])
}

interface LoomDiffProps {
  readonly t: Translate
  readonly workspaceId: string | undefined
  readonly loadChanges: LoadWorkspaceChanges
  readonly renderFactorySlot: RenderFileDiffSlot
  /** Open a file outside the inline comparison, such as the workbench aside. */
  readonly onOpenFile?: (path: string) => void
}

const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, width: '100%', minWidth: 0, border: 'none', borderRadius: 4, padding: '3px 6px', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit', fontSize: 11.5, textAlign: 'left' }
const count: CSSProperties = { color: 'var(--dsw-alias-label-tertiary)', fontSize: 10.5, marginLeft: 'auto', whiteSpace: 'nowrap' }

interface TreeBranchProps {
  readonly t: Translate
  readonly node: DiffTreeDirectory
  readonly depth: number
  readonly collapsed: ReadonlySet<string>
  readonly selectedKey: string | undefined
  readonly onToggle: (path: string) => void
  readonly onSelectFile: (entry: DiffTreeFile) => void
}

function TreeBranch({ t, node, depth, collapsed, selectedKey, onToggle, onSelectFile }: TreeBranchProps): ReactNode {
  const open = !collapsed.has(node.path)
  return <>
    <button type="button" aria-expanded={open} style={{ ...row, paddingLeft: 6 + depth * 14 }} onClick={() => onToggle(node.path)}>
      {open ? <IconChevronDownOutlineRegular size={12} /> : <IconChevronRightOutlineRegular size={12} />}
      {open ? <IconFolderOpenRegular size={13} /> : <IconFolderCloseRegular size={13} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
      <span style={count}>{String(fileCount(node))}</span>
    </button>
    {open && node.directories.map(child => <TreeBranch key={child.path} t={t} node={child} depth={depth + 1} collapsed={collapsed} selectedKey={selectedKey} onToggle={onToggle} onSelectFile={onSelectFile} />)}
    {open && node.files.map(entry => <LoomFileRow key={entry.key} display={entry.file.path.split('/').at(-1) ?? entry.file.path} title={entry.file.path}
      added={entry.file.added} deleted={entry.file.deleted} {...entry.file.binary ? { binary: true } : {}} t={t} selected={entry.key === selectedKey} depth={depth + 1} onClick={() => onSelectFile(entry)} />)}
  </>
}

/**
 * List a workspace's changed files as a repository tree and draw the selected file with native comparison.
 * @param props - selected workspace, its changes read, and the native factory renderer.
 * @returns the tree and comparison, or the state that stands in for them.
 */
export function LoomDiff({ t, workspaceId, loadChanges, renderFactorySlot, onOpenFile }: LoomDiffProps): ReactNode {
  const [changes, setChanges] = useState<readonly WorkspaceRepositoryChangesRecord[] | 'loading' | 'error'>('loading')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (workspaceId === undefined) return
    let live = true
    setChanges('loading'); setSelectedKey(undefined); setCollapsed(new Set())
    void loadChanges({ workspaceId }).then((result) => {
      if (live) setChanges(result.ok ? result.value.repositories : 'error')
    }).catch(() => { if (live) setChanges('error') })
    return () => { live = false }
  }, [workspaceId, attempt, loadChanges])
  if (workspaceId === undefined) return <p style={{ margin: 0, padding: 8 }}>{t('diff.workspace')}</p>
  if (changes === 'loading') return <p style={{ margin: 0, padding: 8 }} role="status">{t('diff.loading')}</p>
  if (changes === 'error') return <p style={{ margin: 0, padding: 8 }} role="alert">{t('state.error')}</p>
  const trees = buildDiffTrees(changes)
  const files = diffTreeFiles(trees)
  if (files.length === 0) return <p style={{ margin: 0, padding: 8 }}>{t('diff.empty')}</p>
  const selected = files.find(entry => entry.key === selectedKey) ?? files[0]!
  const file = selected.file
  const state: NativeFileDiffInput['state'] = file.binary ? { kind: 'binary' }
    : file.hunks.length === 0 ? 'missing'
      : { kind: 'text', path: file.path, display: file.path, before: file.before, after: file.after, coarse: false, hunks: file.hunks }
  const added = files.reduce((total, entry) => total + entry.file.added, 0)
  const deleted = files.reduce((total, entry) => total + entry.file.deleted, 0)
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 280px) 1fr', gap: 12, padding: 8, minHeight: 0, height: '100%', boxSizing: 'border-box', fontSize: 11.5, lineHeight: 1.5 }}>
    <div aria-label={t('diff.files')} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', borderRight: '0.5px solid var(--dsw-alias-border-l4)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '7px 8px 6px', color: 'var(--dsw-alias-label-secondary)', fontSize: 11 }}>
        <span>{t('diff.files')} {String(files.length)}</span>
        <span style={{ marginLeft: 'auto' }}><LoomFileCounts file={{ display: '', added, deleted }} t={t} /></span>
      </div>
      <div role="group" aria-label={t('diff.files')} style={{ minHeight: 0, overflow: 'auto', padding: '0 4px 6px' }}>
        {trees.map(tree => <TreeBranch key={tree.path} t={t} node={tree} depth={0} collapsed={collapsed} selectedKey={selected.key} onToggle={(path) => setCollapsed(current => {
          const next = new Set(current)
          if (next.has(path)) next.delete(path); else next.add(path)
          return next
        })} onSelectFile={(entry) => { setSelectedKey(entry.key); onOpenFile?.(entry.file.path) }} />)}
      </div>
    </div>
    <div style={{ minWidth: 0, minHeight: 0, overflow: 'auto' }}>
      {renderFactorySlot('deliverables.fileDiff', { state, split: true, wrap: false, retry: () => setAttempt(current => current + 1) }, { fallback: <p style={{ margin: 0 }}>{t('integrationUnavailable')}</p> })}
    </div>
  </div>
}
