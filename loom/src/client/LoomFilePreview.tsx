/** Native Diff and full-file preview for one file selected in the Loom aside. */
import { useEffect, useState, type ReactNode } from 'react'
import { CodeBlock, languageForPath } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceFileText } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceFileChangeRecord, WorkspaceRepositoryChangesRecord } from 'dsh-loom/types'
import type { LoadWorkspaceChanges, NativeFileDiffInput, RenderFileDiffSlot } from './LoomDiff.tsx'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** One page of a workspace file, as the native workspace-files Remote returns it. */
export type ReadWorkspaceFile = (sessionId: SessionId, path: string, offset: number, signal: AbortSignal) => Promise<RemoteResult<WorkspaceFileText>>

/** Inputs for the aside's single-file preview. */
export interface LoomFilePreviewProps {
  readonly t: Translate
  readonly workspaceId: string | undefined
  readonly sessionId: SessionId | undefined
  readonly filePath: string
  /** Tab selected when the preview opens. Defaults to the change view. */
  readonly initialMode?: 'diff' | 'file'
  readonly loadChanges: LoadWorkspaceChanges
  readonly renderFactorySlot: RenderFileDiffSlot
  readonly readFile: ReadWorkspaceFile
}

function findFile(repositories: readonly WorkspaceRepositoryChangesRecord[], path: string): { file: WorkspaceFileChangeRecord; directory: string } | undefined {
  const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/u, '')
  for (const repository of repositories) {
    const found = repository.files.find(file => file.path === normalized || normalized.endsWith(`/${file.path}`))
    if (found !== undefined) return { file: found, directory: repository.directory }
  }
  return undefined
}

type FileText = { readonly kind: 'loading' } | { readonly kind: 'error' } | { readonly kind: 'ready'; readonly text: string; readonly truncated: boolean }

async function readWholeFile(readFile: ReadWorkspaceFile, sessionId: SessionId, path: string, signal: AbortSignal): Promise<FileText> {
  let offset = 1
  let text = ''
  for (let page = 0; page < 200; page += 1) {
    const result = await readFile(sessionId, path, offset, signal)
    if (!result.ok) return { kind: 'error' }
    if (result.value.lines === 0) return { kind: 'ready', text, truncated: false }
    text += `${text === '' ? '' : '\n'}${result.value.text}`
    if (result.value.eof) return { kind: 'ready', text, truncated: false }
    offset += result.value.lines
  }
  return { kind: 'ready', text, truncated: true }
}

/**
 * Draw one workspace change as the native comparison, plus its current file text.
 * @param props - file path, workspace change reader, session file reader and native factory renderer.
 * @returns the selected preview, or the state that explains why it is unavailable.
 */
export function LoomFilePreview({ t, workspaceId, sessionId, filePath, initialMode = 'diff', loadChanges, renderFactorySlot, readFile }: LoomFilePreviewProps): ReactNode {
  const [mode, setMode] = useState<'diff' | 'file'>(initialMode)
  const [changes, setChanges] = useState<readonly WorkspaceRepositoryChangesRecord[] | 'loading' | 'error'>('loading')
  const [fileText, setFileText] = useState<FileText>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => { setMode(initialMode) }, [initialMode, filePath])
  useEffect(() => {
    if (workspaceId === undefined) { setChanges('loading'); return }
    let live = true
    setChanges('loading')
    void loadChanges({ workspaceId }).then((result: RemoteResult<{ repositories: WorkspaceRepositoryChangesRecord[] }>) => {
      if (live) setChanges(result.ok ? result.value.repositories : 'error')
    }).catch(() => { if (live) setChanges('error') })
    return () => { live = false }
  }, [workspaceId, attempt, loadChanges])
  const match = Array.isArray(changes) ? findFile(changes, filePath) : undefined
  const fileReadPath = filePath.startsWith('/') || match === undefined
    ? filePath
    : `${match.directory.replace(/\/$/u, '')}/${match.file.path}`
  useEffect(() => {
    if (mode !== 'file' || sessionId === undefined) return
    const controller = new AbortController()
    setFileText({ kind: 'loading' })
    void readWholeFile(readFile, sessionId, fileReadPath, controller.signal).then(next => {
      if (!controller.signal.aborted) setFileText(next)
    }).catch(() => { if (!controller.signal.aborted) setFileText({ kind: 'error' }) })
    return () => controller.abort()
  }, [mode, sessionId, fileReadPath, attempt, readFile])
  const tabs = <div role="tablist" aria-label={t('diff.preview')} style={{ display: 'flex', gap: 4, padding: '6px 10px', borderBottom: '0.5px solid var(--dsw-alias-border-l4)', flex: 'none' }}>
    <button type="button" role="tab" aria-selected={mode === 'diff'} onClick={() => setMode('diff')} style={{ border: 'none', borderRadius: 5, padding: '3px 8px', background: mode === 'diff' ? 'var(--dsw-alias-bg-layer-3)' : 'transparent', color: mode === 'diff' ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)', cursor: 'pointer', font: 'inherit', fontSize: 11.5 }}>{t('diff.tabDiff')}</button>
    <button type="button" role="tab" aria-selected={mode === 'file'} onClick={() => setMode('file')} style={{ border: 'none', borderRadius: 5, padding: '3px 8px', background: mode === 'file' ? 'var(--dsw-alias-bg-layer-3)' : 'transparent', color: mode === 'file' ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)', cursor: 'pointer', font: 'inherit', fontSize: 11.5 }}>{t('diff.tabFile')}</button>
  </div>
  if (mode === 'file') {
    if (sessionId === undefined) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}<p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.noSession')}</p></div>
    return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}
      {fileText.kind === 'loading' && <p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.fileLoading')}</p>}
      {fileText.kind === 'error' && <p role="alert" style={{ margin: 0, padding: 12 }}>{t('state.error')}</p>}
      {fileText.kind === 'ready' && (fileText.text === ''
        ? <p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.fileEmpty')}</p>
        : <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '6px 10px' }}>
            {fileText.truncated && <p role="status" style={{ margin: '0 0 6px', color: 'var(--dsw-alias-label-secondary)', fontSize: 11 }}>{t('diff.fileTruncated')}</p>}
            <CodeBlock code={fileText.text} lang={languageForPath(filePath)} lineNumbers copyLabel={t('diff.copy')} copiedLabel={t('diff.copied')} toolbarLabels={{ codeLabel: t('diff.codeLabel'), wrapLabel: t('diff.wrap'), unwrapLabel: t('diff.unwrap') }} />
          </div>)}
    </div>
  }
  if (workspaceId === undefined) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}<p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.workspace')}</p></div>
  if (changes === 'loading') return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}<p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.loading')}</p></div>
  if (changes === 'error') return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}<p role="alert" style={{ margin: 0, padding: 12 }}>{t('state.error')}</p></div>
  if (match === undefined) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}<p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.previewMissing')}</p></div>
  const file = match.file
  const state: NativeFileDiffInput['state'] = file.binary ? { kind: 'binary' }
    : file.hunks.length === 0 ? 'missing'
      : { kind: 'text', path: file.path, display: file.path, before: file.before, after: file.after, coarse: false, hunks: file.hunks }
  return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 12px', borderBottom: '0.5px solid var(--dsw-alias-border-l4)', flex: 'none' }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }} title={file.path}>{file.path}</span>
      <span style={{ marginLeft: 'auto', color: 'var(--dsw-alias-label-tertiary)', fontSize: 11, whiteSpace: 'nowrap' }}>+{String(file.added)} −{String(file.deleted)}</span>
    </div>
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      {renderFactorySlot('deliverables.fileDiff', { state, split: true, wrap: false, retry: () => setAttempt(current => current + 1) }, { fallback: <p style={{ margin: 0, padding: 12 }}>{t('integrationUnavailable')}</p> })}
    </div>
  </div>
}
