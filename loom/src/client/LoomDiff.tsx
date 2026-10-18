/** Bottom-panel comparison over one attempt workspace, rendered by the native deliverables factory. */
import { useEffect, useState, type ReactNode } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  WorkspaceChangesRequest, WorkspaceFileChangeRecord, WorkspaceRepositoryChangesRecord,
} from 'dsh-loom/types'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** The native factory's caller input, structurally identical to its declaration. */
export interface NativeFileDiffInput {
  state: 'missing' | 'error' | 'loading' | { kind: 'binary' } | { kind: 'oversized' } | { kind: 'text'; path: string; hunks: readonly WorkspaceFileChangeRecord['hunks'][number][] }
  split: boolean
  wrap: boolean
  retry: () => void
}

/** The Factory-render share of the slot props. */
export type RenderFileDiffSlot = (name: 'deliverables.fileDiff', props: NativeFileDiffInput, options?: { fallback?: ReactNode }) => ReactNode

/** Changes read for one workspace. */
export type LoadWorkspaceChanges = (request: WorkspaceChangesRequest) => Promise<RemoteResult<{ repositories: WorkspaceRepositoryChangesRecord[] }>>

interface LoomDiffProps {
  t: Translate
  workspaceId: string | undefined
  loadChanges: LoadWorkspaceChanges
  renderFactorySlot: RenderFileDiffSlot
}

const button = { color: 'inherit', background: 'transparent', border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', font: 'inherit' } as const

/**
 * List the workspace's changed files and draw the selected one with native comparison.
 * @param props - selected workspace, its changes read, and the native factory renderer.
 * @returns the file list and the comparison, or the state that stands in for them.
 */
export function LoomDiff({ t, workspaceId, loadChanges, renderFactorySlot }: LoomDiffProps): ReactNode {
  const [changes, setChanges] = useState<readonly WorkspaceRepositoryChangesRecord[] | 'loading' | 'error'>('loading')
  const [index, setIndex] = useState(0)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (workspaceId === undefined) return
    let live = true
    setChanges('loading'); setIndex(0)
    void loadChanges({ workspaceId }).then((result) => {
      if (live) setChanges(result.ok ? result.value.repositories : 'error')
    }).catch(() => { if (live) setChanges('error') })
    return () => { live = false }
  }, [workspaceId, attempt, loadChanges])
  if (workspaceId === undefined) return <p style={{ margin: 0, padding: 8 }}>{t('diff.workspace')}</p>
  if (changes === 'loading') return <p style={{ margin: 0, padding: 8 }} role="status">{t('diff.loading')}</p>
  if (changes === 'error') return <p style={{ margin: 0, padding: 8 }} role="alert">{t('state.error')}</p>
  const files = changes.flatMap((repository, repo) => repository.files.map(file => ({ repo, file })))
  if (files.length === 0) return <p style={{ margin: 0, padding: 8 }}>{t('diff.empty')}</p>
  const selected = files[Math.min(index, files.length - 1)]!
  const file = selected.file
  const state: NativeFileDiffInput['state'] = file.binary ? { kind: 'binary' }
    : file.hunks.length === 0 ? 'missing'
      : { kind: 'text', path: file.path, hunks: file.hunks }
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 240px) 1fr', gap: 12, padding: 8, minHeight: 0 }}>
    <div aria-label={t('diff.files')} style={{ display: 'flex', flexDirection: 'column', gap: 4, overflow: 'auto', maxHeight: 260 }}>
      {files.map((entry, entryIndex) => <button key={`${entry.repo}:${entryIndex}:${entry.file.path}`} aria-pressed={entryIndex === index} style={{ ...button, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }} onClick={() => setIndex(entryIndex)}>
        {entry.file.path} +{entry.file.added} −{entry.file.deleted}
      </button>)}
    </div>
    <div style={{ minWidth: 0, overflow: 'auto' }}>
      {renderFactorySlot('deliverables.fileDiff', { state, split: true, wrap: false, retry: () => setAttempt(current => current + 1) }, { fallback: <p style={{ margin: 0 }}>{t('integrationUnavailable')}</p> })}
    </div>
  </div>
}
