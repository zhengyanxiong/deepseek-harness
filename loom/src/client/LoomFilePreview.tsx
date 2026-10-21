/** Workspace Diff and full-file preview for one file selected in the Loom aside. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { CodeBlock, languageForPath } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceFileText } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceFileChangeRecord, WorkspaceRepositoryChangesRecord } from 'dsh-workloom/types'
import type { LoadWorkspaceChanges, LoomFileDiffInput } from './LoomDiff.tsx'
import { LoomHunks } from './LoomHunks.tsx'
import { LoomWrapToggle } from './LoomWrapToggle.tsx'
import { diffViewport } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** One page of a workspace file, as the native workspace-files Remote returns it. */
export type ReadWorkspaceFile = (sessionId: SessionId, path: string, offset: number, signal: AbortSignal) => Promise<RemoteResult<WorkspaceFileText>>

/** Inputs for the aside's single-file preview. */
export interface LoomFilePreviewProps {
  readonly t: Translate
  readonly workspaceId: string | undefined
  /** Attempt whose start HEAD is the comparison baseline. */
  readonly attemptId?: string | undefined
  readonly sessionId: SessionId | undefined
  readonly filePath: string
  /** Tab selected when the preview opens. Defaults to the change view. */
  readonly initialMode?: 'diff' | 'file'
  readonly loadChanges: LoadWorkspaceChanges
  readonly readFile: ReadWorkspaceFile
  /** Open or reveal the real file through the native desktop carrier. */
  readonly openPath?: ((path: string, action?: 'open' | 'reveal') => Promise<boolean>) | undefined
  /** Whether the comparison wraps wide lines instead of scrolling sideways. */
  readonly wrap: boolean
  readonly onToggleWrap: () => void
}

function findFile(repositories: readonly WorkspaceRepositoryChangesRecord[], path: string): { file: WorkspaceFileChangeRecord; directory: string } | undefined {
  const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/u, '')
  for (const repository of repositories) {
    const found = repository.files.find(file => file.path === normalized || normalized.endsWith(`/${file.path}`))
    if (found !== undefined) return { file: found, directory: repository.directory }
  }
  return undefined
}

const zoomButton: CSSProperties = { color: 'inherit', background: 'transparent', border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 5, padding: '1px 6px', cursor: 'pointer', font: 'inherit', fontSize: 11, lineHeight: '18px' }

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
 * Draw one workspace change as a unified comparison, plus its current file text.
 * @param props - file path, workspace change reader, session file reader and native factory renderer.
 * @returns the selected preview, or the state that explains why it is unavailable.
 */
export function LoomFilePreview({ t, workspaceId, attemptId, sessionId, filePath, initialMode = 'diff', loadChanges, readFile, openPath, wrap, onToggleWrap }: LoomFilePreviewProps): ReactNode {
  const [mode, setMode] = useState<'diff' | 'file'>(initialMode)
  const [changes, setChanges] = useState<readonly WorkspaceRepositoryChangesRecord[] | 'loading' | 'error'>('loading')
  const [fileText, setFileText] = useState<FileText>({ kind: 'loading' })
  const [zoom, setZoom] = useState(1)
  useEffect(() => { setMode(initialMode) }, [initialMode, filePath])
  useEffect(() => {
    if (workspaceId === undefined) { setChanges('loading'); return }
    let live = true
    setChanges('loading')
    void loadChanges({ workspaceId, ...(attemptId === undefined ? {} : { attemptId }) }).then((result: RemoteResult<{ repositories: WorkspaceRepositoryChangesRecord[] }>) => {
      if (live) setChanges(result.ok ? result.value.repositories : 'error')
    }).catch(() => { if (live) setChanges('error') })
    return () => { live = false }
  }, [workspaceId, attemptId, loadChanges])
  const match = Array.isArray(changes) ? findFile(changes, filePath) : undefined
  const fileReadPath = filePath.startsWith('/') || match === undefined
    ? filePath
    : `${match.directory.replace(/\/$/u, '')}/${match.file.path}`
  const absoluteFile = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u.test(fileReadPath)
  useEffect(() => {
    if (mode !== 'file' || sessionId === undefined) return
    const controller = new AbortController()
    setFileText({ kind: 'loading' })
    void readWholeFile(readFile, sessionId, fileReadPath, controller.signal).then(next => {
      if (!controller.signal.aborted) setFileText(next)
    }).catch(() => { if (!controller.signal.aborted) setFileText({ kind: 'error' }) })
    return () => controller.abort()
  }, [mode, sessionId, fileReadPath, readFile])
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
        : <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, padding: '3px 10px', borderBottom: '0.5px solid var(--dsw-alias-border-l4)', flex: 'none' }}>
              <button type="button" aria-label={t('diff.zoomOut')} title={t('diff.zoomOut')} style={zoomButton} onClick={() => setZoom(current => Math.max(0.75, Number((current - 0.15).toFixed(2))))}>−</button>
              <button type="button" title={t('diff.zoomReset')} style={{ ...zoomButton, minWidth: 46 }} onClick={() => setZoom(1)}>{String(Math.round(zoom * 100))}%</button>
              {openPath !== undefined && absoluteFile && <button type="button" style={zoomButton} title={t('diff.openExternal')} onClick={() => { void openPath(fileReadPath) }}>{t('diff.openExternal')}</button>}
              <button type="button" aria-label={t('diff.zoomIn')} title={t('diff.zoomIn')} style={zoomButton} onClick={() => setZoom(current => Math.min(2, Number((current + 0.15).toFixed(2))))}>+</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '6px 10px', ...({ '--dsl-code-block-content-font': `${String(Math.round(12 * zoom))}px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` } as CSSProperties) }}>
              {fileText.truncated && <p role="status" style={{ margin: '0 0 6px', color: 'var(--dsw-alias-label-secondary)', fontSize: 11 }}>{t('diff.fileTruncated')}</p>}
              <CodeBlock code={fileText.text} lang={languageForPath(filePath)} lineNumbers copyLabel={t('diff.copy')} copiedLabel={t('diff.copied')} toolbarLabels={{ codeLabel: t('diff.codeLabel'), wrapLabel: t('diff.wrap'), unwrapLabel: t('diff.unwrap') }} />
            </div>
          </div>)}
    </div>
  }
  if (workspaceId === undefined) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}<p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.workspace')}</p></div>
  if (changes === 'loading') return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}<p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.loading')}</p></div>
  if (changes === 'error') return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}<p role="alert" style={{ margin: 0, padding: 12 }}>{t('state.error')}</p></div>
  if (match === undefined) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}<p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.previewMissing')}</p></div>
  const file = match.file
  const state: LoomFileDiffInput['state'] = file.binary ? { kind: 'binary' }
    : file.hunks.length === 0 ? 'missing'
      : { kind: 'text', path: file.path, display: file.path, before: file.before, after: file.after, coarse: false, hunks: file.hunks }
  return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '0.5px solid var(--dsw-alias-border-l4)', flex: 'none' }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }} title={file.path}>{file.path}</span>
      <span style={{ marginLeft: 'auto', color: 'var(--dsw-alias-label-tertiary)', fontSize: 11, whiteSpace: 'nowrap' }}>+{String(file.added)} −{String(file.deleted)}</span>
      <LoomWrapToggle t={t} wrap={wrap} onToggle={onToggleWrap} />
    </div>
    <div data-loom-diff-viewport style={diffViewport}>
      <LoomHunks state={state} wrap={wrap} t={t} />
    </div>
  </div>
}
