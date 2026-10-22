/** Workspace Diff and full-file preview for one file selected in the Loom aside. */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  CodeBlock, FileTypeIcon, IconCloseOutlineRegular, IconFullscreenOutlineRegular, ImageLightbox, MarkdownDelegateProvider, MarkdownText, PathLabel, languageForPath,
  type ImageLightboxLabels, type MarkdownLabels,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionWorkspacePathApplication } from '@deepseek-ai/dsh-api-session-controller/types'
import type { WorkspaceFileBytes, WorkspaceFileText } from '@deepseek-ai/dsh-api-workspace-files/types'
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
export type ReadWorkspaceFileBytes = (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<RemoteResult<WorkspaceFileBytes>>
export type ReadWorkspaceApplications = (path: string, signal: AbortSignal) => Promise<RemoteResult<readonly SessionWorkspacePathApplication[]>>

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
  /** Read raw bytes for images and Markdown-relative images. */
  readonly readBytes?: ReadWorkspaceFileBytes | undefined
  /** Open or reveal the real file through the native desktop carrier. */
  readonly openPath?: ((path: string, action?: 'open' | 'reveal') => Promise<boolean>) | undefined
  /** Native registered applications that can open this path. */
  readonly applications?: ReadWorkspaceApplications | undefined
  /** Open the path explicitly in one registered application. */
  readonly openWith?: ((path: string, application: string) => Promise<boolean>) | undefined
  /** Close the Loom preview. */
  readonly onClose?: (() => void) | undefined
  /** Whether the Loom page is presenting this preview fullscreen. */
  readonly fullscreen?: boolean
  /** Toggle the Loom page's preview fullscreen layout. */
  readonly onToggleFullscreen?: (() => void) | undefined
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

type FileViewKind = 'markdown' | 'image' | 'binary' | 'text'

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  bmp: 'image/bmp', ico: 'image/x-icon', svg: 'image/svg+xml',
}
const BINARY_EXTENSIONS = new Set(['pdf', 'zip', 'tar', 'gz', 'tgz', '7z', 'rar', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'key', 'mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'mp3', 'wav', 'ogg', 'woff', 'woff2', 'ttf', 'otf'])

function extensionOf(path: string): string {
  const name = path.replaceAll('\\', '/').split('/').at(-1) ?? path
  return name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
}

function fileViewKind(path: string): FileViewKind {
  const extension = extensionOf(path)
  if (extension === 'md' || extension === 'mdx' || extension === 'markdown') return 'markdown'
  if (IMAGE_TYPES[extension] !== undefined) return 'image'
  if (BINARY_EXTENSIONS.has(extension)) return 'binary'
  return 'text'
}

function isAbsolutePath(path: string): boolean {
  return /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u.test(path)
}

function normalizeRelative(baseFile: string, destination: string): string {
  const base = baseFile.replaceAll('\\', '/')
  const directory = base.slice(0, base.lastIndexOf('/') + 1)
  const joined = `${destination.startsWith('/') ? '' : directory}${destination}`
  const parts: string[] = []
  for (const part of joined.split('/')) {
    if (part === '' && parts.length === 0) { parts.push(''); continue }
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `${joined.startsWith('/') ? '/' : ''}${parts.join('/')}`
}

function markdownImageDestinations(text: string): string[] {
  const found = new Set<string>()
  const pattern = /!\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+["'][^)]*)?\)/gu
  for (const match of text.matchAll(pattern)) {
    const raw = match[1]
    if (raw === undefined) continue
    const destination = raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw
    if (/^(?:https?:|data:|blob:|mailto:|#)/iu.test(destination)) continue
    found.add(destination)
  }
  return [...found]
}

function mediaTypeFor(path: string): string {
  return IMAGE_TYPES[extensionOf(path)] ?? 'application/octet-stream'
}

const fileToolbar: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5, padding: '7px 10px 6px',
  borderBottom: '0.5px solid var(--dsw-alias-border-l4)', flex: 'none', minWidth: 0,
}
const fileHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }
const fileIdentity: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }
const fileName: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--dsw-alias-label-primary)' }
const filePathLabel: CSSProperties = { fontSize: 10, minWidth: 0 }
const fileTypeBadge: CSSProperties = { flex: 'none', color: 'var(--dsw-alias-label-tertiary)', fontSize: 9.5, fontFamily: 'ui-monospace, monospace' }
const fileActionRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, minHeight: 20, flexWrap: 'wrap' }
const fileAction: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, border: '0.5px solid var(--dsw-alias-border-l3)',
  borderRadius: 5, background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer',
  font: 'inherit', fontSize: 10, lineHeight: '18px', padding: '0 6px',
}
const iconAction: CSSProperties = { ...fileAction, padding: '0 5px' }
const appMenu: CSSProperties = {
  position: 'absolute', top: 22, right: 0, zIndex: 20, minWidth: 168, maxHeight: 240, overflow: 'auto',
  background: 'var(--dsw-alias-bg-layer-2)', border: '0.5px solid var(--dsw-alias-border-l3)',
  borderRadius: 7, boxShadow: '0 8px 24px rgba(0,0,0,.28)', padding: 3,
}
const appMenuItem: CSSProperties = { display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-primary)', cursor: 'pointer', font: 'inherit', fontSize: 11, padding: '5px 7px', borderRadius: 4 }

function fileNameOf(path: string): string {
  return path.replaceAll('\\', '/').split('/').at(-1) ?? path
}

/**
 * Draw one workspace change as a unified comparison, plus its current file in
 * the native-style preview: rendered Markdown, images, text, or an open action
 * for binary content.
 * @param props - file path, workspace change reader, session file reader, native open actions and fullscreen state.
 * @returns the selected preview, or the state that explains why it is unavailable.
 */
export function LoomFilePreview({
  t, workspaceId, attemptId, sessionId, filePath, initialMode = 'diff', loadChanges, readFile,
  readBytes, openPath, applications, openWith, onClose, fullscreen, onToggleFullscreen, wrap, onToggleWrap,
}: LoomFilePreviewProps): ReactNode {
  const [mode, setMode] = useState<'diff' | 'file'>(initialMode)
  const [changes, setChanges] = useState<readonly WorkspaceRepositoryChangesRecord[] | 'loading' | 'error'>('loading')
  const [fileText, setFileText] = useState<FileText>({ kind: 'loading' })
  const [image, setImage] = useState<{ readonly kind: 'loading' } | { readonly kind: 'ready'; readonly url: string; readonly mediaType: string } | { readonly kind: 'error' }>()
  const [lightbox, setLightbox] = useState(false)
  const [applicationsState, setApplicationsState] = useState<readonly SessionWorkspacePathApplication[]>([])
  const [applicationsOpen, setApplicationsOpen] = useState(false)
  const [markdownImages, setMarkdownImages] = useState<ReadonlyMap<string, string>>(new Map())
  const [zoom, setZoom] = useState(1)
  const kind = fileViewKind(filePath)
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
  const absoluteFile = isAbsolutePath(fileReadPath)
  useEffect(() => {
    if (mode !== 'file' || sessionId === undefined || kind === 'image' || kind === 'binary') { setFileText({ kind: 'loading' }); return }
    const controller = new AbortController()
    setFileText({ kind: 'loading' })
    void readWholeFile(readFile, sessionId, fileReadPath, controller.signal).then(next => {
      if (!controller.signal.aborted) setFileText(next)
    }).catch(() => { if (!controller.signal.aborted) setFileText({ kind: 'error' }) })
    return () => controller.abort()
  }, [mode, sessionId, fileReadPath, kind, readFile])
  useEffect(() => {
    if (mode !== 'file' || kind !== 'image' || sessionId === undefined || readBytes === undefined) { setImage(undefined); return }
    const controller = new AbortController()
    let blobUrl: string | undefined
    setImage({ kind: 'loading' })
    void readBytes(sessionId, fileReadPath, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (!result.ok) { setImage({ kind: 'error' }); return }
      const mediaType = mediaTypeFor(fileReadPath)
      blobUrl = URL.createObjectURL(new Blob([new Uint8Array(result.value.data).buffer], { type: mediaType }))
      setImage({ kind: 'ready', url: blobUrl, mediaType })
    }).catch(() => { if (!controller.signal.aborted) setImage({ kind: 'error' }) })
    return () => {
      controller.abort()
      if (blobUrl !== undefined) URL.revokeObjectURL(blobUrl)
    }
  }, [mode, kind, sessionId, fileReadPath, readBytes])
  useEffect(() => {
    if (applications === undefined || !absoluteFile) { setApplicationsState([]); return }
    const controller = new AbortController()
    void applications(fileReadPath, controller.signal).then((result) => {
      if (!controller.signal.aborted) setApplicationsState(result.ok ? result.value : [])
    }).catch(() => { if (!controller.signal.aborted) setApplicationsState([]) })
    return () => controller.abort()
  }, [applications, fileReadPath, absoluteFile])
  useEffect(() => {
    if (mode !== 'file' || kind !== 'markdown' || sessionId === undefined || readBytes === undefined || fileText.kind !== 'ready') { setMarkdownImages(new Map()); return }
    const controller = new AbortController()
    const urls: string[] = []
    void (async () => {
      const destinations = markdownImageDestinations(fileText.text)
      const entries = await Promise.all(destinations.map(async (destination): Promise<readonly [string, string] | undefined> => {
        const path = isAbsolutePath(destination) ? destination : normalizeRelative(fileReadPath, destination)
        const result = await readBytes(sessionId, path, controller.signal)
        if (!result.ok || controller.signal.aborted) return undefined
        const url = URL.createObjectURL(new Blob([new Uint8Array(result.value.data).buffer], { type: mediaTypeFor(path) }))
        urls.push(url)
        return [destination, url] as const
      }))
      if (controller.signal.aborted) { for (const url of urls) URL.revokeObjectURL(url); return }
      setMarkdownImages(new Map(entries.filter((entry): entry is readonly [string, string] => entry !== undefined)))
    })().catch(() => { if (!controller.signal.aborted) setMarkdownImages(new Map()) })
    return () => {
      controller.abort()
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [mode, kind, sessionId, fileReadPath, readBytes, fileText])
  const markdownLabels = useMemo<MarkdownLabels>(() => ({
    code: {
      copyLabel: t('diff.copy'), copiedLabel: t('diff.copied'),
      toolbarLabels: { codeLabel: t('diff.codeLabel'), wrapLabel: t('diff.wrap'), unwrapLabel: t('diff.unwrap') },
    },
    footnotes: t('diff.footnotes'),
  }), [t])
  const lightboxLabels = useMemo<ImageLightboxLabels>(() => ({ dialog: t('diff.imagePreview'), close: t('form.close') }), [t])
  const markdownPathImages = useMemo(() => ({
    resolve: (value: string): string | undefined => markdownImages.get(value),
  }), [markdownImages])
  const markdownFileImages = useMemo(() => ({
    resolve: (value: string): string | undefined => markdownImages.get(value),
    labels: { ...lightboxLabels, open: t('diff.imagePreview'), loading: t('diff.fileLoading'), failed: t('state.error') },
  }), [markdownImages, lightboxLabels, t])
  const tabs = <div role="tablist" aria-label={t('diff.preview')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderBottom: '0.5px solid var(--dsw-alias-border-l4)', flex: 'none' }}>
    <button type="button" role="tab" aria-selected={mode === 'diff'} onClick={() => setMode('diff')} style={{ border: 'none', borderRadius: 5, padding: '3px 8px', background: mode === 'diff' ? 'var(--dsw-alias-bg-layer-3)' : 'transparent', color: mode === 'diff' ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)', cursor: 'pointer', font: 'inherit', fontSize: 11.5 }}>{t('diff.tabDiff')}</button>
    <button type="button" role="tab" aria-selected={mode === 'file'} onClick={() => setMode('file')} style={{ border: 'none', borderRadius: 5, padding: '3px 8px', background: mode === 'file' ? 'var(--dsw-alias-bg-layer-3)' : 'transparent', color: mode === 'file' ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)', cursor: 'pointer', font: 'inherit', fontSize: 11.5 }}>{t('diff.tabFile')}</button>
    <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{onToggleFullscreen !== undefined && <button type="button" aria-label={fullscreen === true ? t('diff.exitFullscreen') : t('diff.fullscreen')} title={fullscreen === true ? t('diff.exitFullscreen') : t('diff.fullscreen')} style={iconAction} onClick={onToggleFullscreen}><IconFullscreenOutlineRegular size={13} /></button>}{onClose !== undefined && <button type="button" aria-label={t('form.close')} title={t('form.close')} style={iconAction} onClick={onClose}><IconCloseOutlineRegular size={13} /></button>}</span>
  </div>
  const toolbar = <div style={fileToolbar}>
    <div style={fileHead}>
      <FileTypeIcon path={filePath} size={15} />
      <div style={fileIdentity}>
        <span style={fileName} title={filePath}>{fileNameOf(filePath)}</span>
        <PathLabel path={fileReadPath} style={filePathLabel} />
      </div>
      <span style={fileTypeBadge}>{extensionOf(filePath).toUpperCase() || t('diff.tabFile')}</span>
    </div>
    <div style={fileActionRow}>
      {openPath !== undefined && absoluteFile && <button type="button" style={fileAction} onClick={() => { void openPath(fileReadPath) }}>{t('diff.openExternal')}</button>}
      {openPath !== undefined && absoluteFile && <button type="button" style={fileAction} onClick={() => { void openPath(fileReadPath, 'reveal') }}>{t('diff.reveal')}</button>}
      {applicationsState.length > 0 && openWith !== undefined && <div style={{ position: 'relative' }}>
        <button type="button" style={fileAction} aria-expanded={applicationsOpen} onClick={() => setApplicationsOpen(current => !current)}>{t('diff.openWith')} ▾</button>
        {applicationsOpen && <div style={appMenu}>{applicationsState.map(application => <button key={application.id} type="button" style={appMenuItem} onClick={() => { setApplicationsOpen(false); void openWith(fileReadPath, application.id) }}>{application.name}{application.default ? ` · ${t('diff.defaultApp')}` : ''}</button>)}</div>}
      </div>}
      {kind === 'markdown' && <span style={{ ...fileAction, border: 'none', padding: 0, cursor: 'default' }}>Markdown</span>}
    </div>
  </div>
  if (mode === 'file') {
    if (sessionId === undefined) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}{toolbar}<p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.noSession')}</p></div>
    const viewer = kind === 'image'
      ? readBytes === undefined
        ? <p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.binaryNoPreview')}</p>
        : image === undefined || image.kind === 'loading'
        ? <p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.fileLoading')}</p>
        : image.kind === 'error'
          ? <p role="alert" style={{ margin: 0, padding: 12 }}>{t('state.error')}</p>
          : <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: 12, background: 'var(--dsw-alias-bg-layer-1)' }}>
              <img src={image.url} alt={fileNameOf(filePath)} title={t('diff.imagePreview')} onClick={() => setLightbox(true)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: 'zoom-in', borderRadius: 4 }} />
            </div>
      : kind === 'binary'
        ? <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, color: 'var(--dsw-alias-label-secondary)' }}><FileTypeIcon path={filePath} size={28} /><p style={{ margin: 0, fontSize: 12 }}>{t('diff.binaryNoPreview')}</p></div>
        : fileText.kind === 'loading'
          ? <p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.fileLoading')}</p>
          : fileText.kind === 'error'
            ? <p role="alert" style={{ margin: 0, padding: 12 }}>{t('state.error')}</p>
            : fileText.text === ''
              ? <p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.fileEmpty')}</p>
              : kind === 'markdown'
                ? <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 14px' }}>
                    {fileText.truncated && <p role="status" style={{ margin: '0 0 8px', color: 'var(--dsw-alias-label-secondary)', fontSize: 11 }}>{t('diff.fileTruncated')}</p>}
                    <MarkdownDelegateProvider fileImages={markdownFileImages}>
                      <MarkdownText text={fileText.text} labels={markdownLabels} pathImages={markdownPathImages} />
                    </MarkdownDelegateProvider>
                  </div>
                : <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, padding: '3px 10px', borderBottom: '0.5px solid var(--dsw-alias-border-l4)', flex: 'none' }}>
                      <button type="button" aria-label={t('diff.zoomOut')} title={t('diff.zoomOut')} style={zoomButton} onClick={() => setZoom(current => Math.max(0.75, Number((current - 0.15).toFixed(2))))}>−</button>
                      <button type="button" title={t('diff.zoomReset')} style={{ ...zoomButton, minWidth: 46 }} onClick={() => setZoom(1)}>{String(Math.round(zoom * 100))}%</button>
                      <button type="button" aria-label={t('diff.zoomIn')} title={t('diff.zoomIn')} style={zoomButton} onClick={() => setZoom(current => Math.min(2, Number((current + 0.15).toFixed(2))))}>+</button>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '6px 10px', ...({ '--dsl-code-block-content-font': `${String(Math.round(12 * zoom))}px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` } as CSSProperties) }}>
                      {fileText.truncated && <p role="status" style={{ margin: '0 0 6px', color: 'var(--dsw-alias-label-secondary)', fontSize: 11 }}>{t('diff.fileTruncated')}</p>}
                      <CodeBlock code={fileText.text} lang={languageForPath(filePath)} lineNumbers copyLabel={t('diff.copy')} copiedLabel={t('diff.copied')} toolbarLabels={{ codeLabel: t('diff.codeLabel'), wrapLabel: t('diff.wrap'), unwrapLabel: t('diff.unwrap') }} />
                    </div>
                  </div>
    return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}{toolbar}{viewer}
      {lightbox && image?.kind === 'ready' && <ImageLightbox src={image.url} alt={fileNameOf(filePath)} labels={lightboxLabels} onClose={() => setLightbox(false)} />}
    </div>
  }
  if (workspaceId === undefined) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}{toolbar}<p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.workspace')}</p></div>
  if (changes === 'loading') return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}{toolbar}<p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.loading')}</p></div>
  if (changes === 'error') return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}{toolbar}<p role="alert" style={{ margin: 0, padding: 12 }}>{t('state.error')}</p></div>
  if (match === undefined) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}{toolbar}<p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.previewMissing')}</p></div>
  const file = match.file
  const state: LoomFileDiffInput['state'] = file.binary ? { kind: 'binary' }
    : file.hunks.length === 0 ? 'missing'
      : { kind: 'text', path: file.path, display: file.path, before: file.before, after: file.after, coarse: false, hunks: file.hunks }
  return <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>{tabs}{toolbar}
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
