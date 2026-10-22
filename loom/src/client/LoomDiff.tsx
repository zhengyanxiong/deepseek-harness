/** Changed-file tree and comparison over one attempt workspace. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import {
  IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconFolderCloseRegular, IconFolderOpenRegular, IconPanelLeftOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  WorkspaceChangesRequest, WorkspaceFileChangeRecord, WorkspaceRepositoryChangesRecord,
} from 'dsh-workloom/types'
import { LoomFileCounts, LoomFileRow } from './LoomFileRow.tsx'
import { LoomHunks } from './LoomHunks.tsx'
import { LoomWrapToggle } from './LoomWrapToggle.tsx'
import { diffViewport } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** Diff state accepted by the Loom-owned comparison body. */
export interface LoomFileDiffInput {
  state: 'missing' | 'error' | 'loading' | { kind: 'binary' } | { kind: 'oversized' } | { kind: 'text'; path: string; display: string; before: boolean; after: boolean; coarse: boolean; hunks: readonly WorkspaceFileChangeRecord['hunks'][number][] }
  split: boolean
  wrap: boolean
  retry: () => void
}

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
  /** Attempt whose start HEAD is the comparison baseline. */
  readonly attemptId?: string | undefined
  readonly loadChanges: LoadWorkspaceChanges
  /** Whether the comparison wraps wide lines instead of scrolling sideways. */
  readonly wrap: boolean
  readonly onToggleWrap: () => void
  /** Open the selected file explicitly in the right-side preview. */
  readonly onOpenInRight?: (path: string) => void
  /** Reports the changed-file count only after this pane reads the changes. */
  readonly onChangesCount?: (count: number) => void
}

const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, width: '100%', minWidth: 0, border: 'none', borderRadius: 4, padding: '3px 6px', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit', fontSize: 11.5, textAlign: 'left' }
const count: CSSProperties = { color: 'var(--dsw-alias-label-tertiary)', fontSize: 10.5, marginLeft: 'auto', whiteSpace: 'nowrap' }

interface TreeBranchProps {
  readonly t: Translate
  readonly node: DiffTreeDirectory
  readonly depth: number
  readonly expanded: ReadonlySet<string>
  readonly selectedKey: string | undefined
  readonly onToggle: (path: string) => void
  readonly onSelectFile: (entry: DiffTreeFile) => void
}

function TreeBranch({ t, node, depth, expanded, selectedKey, onToggle, onSelectFile }: TreeBranchProps): ReactNode {
  const open = expanded.has(node.path)
  return <>
    <button type="button" aria-expanded={open} style={{ ...row, paddingLeft: 6 + depth * 14 }} onClick={() => onToggle(node.path)}>
      {open ? <IconChevronDownOutlineRegular size={12} /> : <IconChevronRightOutlineRegular size={12} />}
      {open ? <IconFolderOpenRegular size={13} /> : <IconFolderCloseRegular size={13} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
      <span style={count}>{String(fileCount(node))}</span>
    </button>
    {open && node.directories.map(child => <TreeBranch key={child.path} t={t} node={child} depth={depth + 1} expanded={expanded} selectedKey={selectedKey} onToggle={onToggle} onSelectFile={onSelectFile} />)}
    {open && node.files.map(entry => <LoomFileRow key={entry.key} display={entry.file.path.split('/').at(-1) ?? entry.file.path} title={entry.file.path}
      added={entry.file.added} deleted={entry.file.deleted} {...entry.file.binary ? { binary: true } : {}} t={t} selected={entry.key === selectedKey} depth={depth + 1} onClick={() => onSelectFile(entry)} />)}
  </>
}

/**
 * List a workspace's changed files as a repository tree and draw the selected file with a unified comparison.
 * @param props - selected workspace, its changes read, and the native factory renderer.
 * @returns the tree and comparison, or the state that stands in for them.
 */
export function LoomDiff({ t, workspaceId, attemptId, loadChanges, wrap, onToggleWrap, onOpenInRight, onChangesCount }: LoomDiffProps): ReactNode {
  const [changes, setChanges] = useState<readonly WorkspaceRepositoryChangesRecord[] | 'loading' | 'error'>('loading')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (workspaceId === undefined) return
    let live = true
    setChanges('loading'); setSelectedKey(undefined); setExpanded(new Set())
    void loadChanges({ workspaceId, ...(attemptId === undefined ? {} : { attemptId }) }).then((result) => {
      if (!live) return
      if (result.ok) {
        setChanges(result.value.repositories)
        onChangesCount?.(result.value.repositories.reduce((total, repository) => total + repository.files.length, 0))
      } else {
        setChanges('error')
        onChangesCount?.(0)
      }
    }).catch(() => {
      if (live) { setChanges('error'); onChangesCount?.(0) }
    })
    return () => { live = false }
  }, [workspaceId, attemptId, loadChanges, onChangesCount])
  if (workspaceId === undefined) return <p style={{ margin: 0, padding: 8 }}>{t('diff.workspace')}</p>
  if (changes === 'loading') return <p style={{ margin: 0, padding: 8 }} role="status">{t('diff.loading')}</p>
  if (changes === 'error') return <p style={{ margin: 0, padding: 8 }} role="alert">{t('state.error')}</p>
  const trees = buildDiffTrees(changes)
  const files = diffTreeFiles(trees)
  if (files.length === 0) return <p style={{ margin: 0, padding: 8 }}>{t('diff.empty')}</p>
  const selected = files.find(entry => entry.key === selectedKey) ?? files[0]!
  const file = selected.file
  const state: LoomFileDiffInput['state'] = file.binary ? { kind: 'binary' }
    : file.hunks.length === 0 ? 'missing'
      : { kind: 'text', path: file.path, display: file.path, before: file.before, after: file.after, coarse: false, hunks: file.hunks }
  const added = files.reduce((total, entry) => total + entry.file.added, 0)
  const deleted = files.reduce((total, entry) => total + entry.file.deleted, 0)
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 340px) 1fr', gap: 12, padding: 8, minHeight: 0, height: '100%', boxSizing: 'border-box', fontSize: 11.5, lineHeight: 1.5 }}>
    <div aria-label={t('diff.files')} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', borderRight: '0.5px solid var(--dsw-alias-border-l4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, rowGap: 4, flexWrap: 'wrap', padding: '7px 8px 6px', color: 'var(--dsw-alias-label-secondary)', fontSize: 11 }}>
        <span style={{ flex: 'none', whiteSpace: 'nowrap' }}>{t('diff.files')} {String(files.length)}</span>
        <span style={{ marginLeft: 'auto', flex: 'none' }}><LoomFileCounts file={{ display: '', added, deleted }} t={t} /></span>
        {onOpenInRight !== undefined && <button type="button" title={t('diff.openInRight')} aria-label={t('diff.openInRight')} onClick={() => onOpenInRight(selected.file.path)} style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 5, background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', font: 'inherit', fontSize: 10.5, lineHeight: '18px', padding: '0 5px', whiteSpace: 'nowrap' }}><span aria-hidden style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}><IconPanelLeftOutlineRegular size={11} /></span>{t('diff.openInRight')}</button>}
        <LoomWrapToggle t={t} wrap={wrap} onToggle={onToggleWrap} />
      </div>
      <div role="group" aria-label={t('diff.files')} style={{ minHeight: 0, overflow: 'auto', padding: '0 4px 6px' }}>
        {trees.map(tree => <TreeBranch key={tree.path} t={t} node={tree} depth={0} expanded={expanded} selectedKey={selected.key} onToggle={(path) => setExpanded(current => {
          const next = new Set(current)
          if (next.has(path)) next.delete(path); else next.add(path)
          return next
        })} onSelectFile={(entry) => { setSelectedKey(entry.key) }} />)}
      </div>
    </div>
    <div data-loom-diff-viewport style={diffViewport}>
      <LoomHunks state={state} wrap={wrap} t={t} />
    </div>
  </div>
}
