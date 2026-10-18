/** Native-Diff review of one turn's changed files, for the Loom right aside. */
import { useEffect, useState, type ReactNode } from 'react'
import { IconDeliverDocRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RenderFileDiffSlot } from './LoomDiff.tsx'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

interface ReviewFile {
  readonly path: string
  readonly display: string
  readonly added: number
  readonly deleted: number
  readonly binary?: boolean
  readonly oversized?: boolean
}

interface ReviewSummary {
  readonly turn: number
  readonly files: readonly ReviewFile[]
  readonly total: number
  readonly added: number
  readonly deleted: number
}

type SummaryState = { readonly kind: 'loading' } | { readonly kind: 'missing' } | { readonly kind: 'error' } | { readonly kind: 'ready'; readonly summary: ReviewSummary }

type ReviewDiff =
  | { readonly kind: 'loading' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'error' }
  | { readonly kind: 'binary' }
  | { readonly kind: 'oversized' }
  | { readonly kind: 'text'; readonly path: string; readonly display: string; readonly before: boolean; readonly after: boolean; readonly coarse: boolean; readonly hunks: readonly { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: readonly string[] }[] }

/** Inputs for the aside's turn-change review. */
export interface LoomReviewPreviewProps {
  /** Localized copy. */
  readonly t: Translate
  /** Session whose turn announced the changes. */
  readonly sessionId: string | undefined
  /** Sequence of the `workspace/changes` announcement. */
  readonly seq: number
  /** File index to select first, when the opening row named one. */
  readonly initialIndex?: number | undefined
  /** Native comparison factory registered by ui-deliverables. */
  readonly renderFactorySlot: RenderFileDiffSlot
  /** Opens one listed file as a whole-file preview. */
  readonly onOpenFile?: (path: string) => void
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFile(value: unknown): value is ReviewFile {
  return record(value) && typeof value['path'] === 'string' && typeof value['display'] === 'string'
    && Number.isSafeInteger(value['added']) && Number.isSafeInteger(value['deleted'])
    && (value['binary'] === undefined || value['binary'] === true)
    && (value['oversized'] === undefined || value['oversized'] === true)
}

function readSummary(value: unknown): ReviewSummary | undefined {
  if (!record(value)) return undefined
  const files = value['files']
  const turn = value['turn']
  const total = value['total']
  const added = value['added']
  const deleted = value['deleted']
  if (!Array.isArray(files) || typeof turn !== 'number' || !Number.isSafeInteger(turn)
    || typeof total !== 'number' || !Number.isSafeInteger(total)
    || typeof added !== 'number' || !Number.isSafeInteger(added)
    || typeof deleted !== 'number' || !Number.isSafeInteger(deleted)) return undefined
  const listed = files.filter(isFile)
  if (listed.length !== files.length) return undefined
  return { turn, files: listed, total, added, deleted }
}

function readDiff(value: unknown): ReviewDiff {
  if (!record(value)) return { kind: 'error' }
  const path = value['path']
  const display = value['display']
  if (typeof path !== 'string' || typeof display !== 'string') return { kind: 'error' }
  if (value['kind'] === 'binary') return { kind: 'binary' }
  if (value['kind'] === 'oversized') return { kind: 'oversized' }
  const before = value['before']
  const after = value['after']
  const coarse = value['coarse']
  const hunks = value['hunks']
  if (value['kind'] !== 'text' || typeof before !== 'boolean' || typeof after !== 'boolean'
    || typeof coarse !== 'boolean' || !Array.isArray(hunks)) return { kind: 'error' }
  const listed = hunks.filter((hunk): hunk is { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] } => {
    if (!record(hunk) || !Array.isArray(hunk['lines']) || !hunk['lines'].every(line => typeof line === 'string')) return false
    const fields = [hunk['oldStart'], hunk['oldLines'], hunk['newStart'], hunk['newLines']]
    return fields.every(field => typeof field === 'number' && Number.isSafeInteger(field) && field >= 0)
  })
  if (listed.length !== hunks.length) return { kind: 'error' }
  return { kind: 'text', path, display, before, after, coarse, hunks: listed }
}

function counts(file: ReviewFile, t: Translate): ReactNode {
  if (file.binary === true) return <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{t('review.binary')}</span>
  if (file.oversized === true) return <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{t('review.oversized')}</span>
  return <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}><span style={{ color: 'var(--dsw-alias-label-success)' }}>+{String(file.added)}</span> −{String(file.deleted)}</span>
}

/**
 * Draw one turn's changed files as a selector over the native comparison.
 * @param props - coordinates, native Diff factory, and the optional whole-file opener.
 * @returns the review, or the state that explains why it is unavailable.
 */
export function LoomReviewPreview({ t, sessionId, seq, initialIndex = 0, renderFactorySlot, onOpenFile }: LoomReviewPreviewProps): ReactNode {
  const [summaryState, setSummaryState] = useState<SummaryState>({ kind: 'loading' })
  const [diff, setDiff] = useState<ReviewDiff>({ kind: 'loading' })
  const [selected, setSelected] = useState(initialIndex)
  const [summaryAttempt, setSummaryAttempt] = useState(0)
  const [diffAttempt, setDiffAttempt] = useState(0)
  useEffect(() => { setSelected(initialIndex) }, [initialIndex, sessionId, seq])
  useEffect(() => {
    if (sessionId === undefined) { setSummaryState({ kind: 'loading' }); return }
    const controller = new AbortController()
    setSummaryState({ kind: 'loading' })
    const query = new URLSearchParams({ sessionId, seq: String(seq) })
    void fetch(`api/changes.summary?${query.toString()}`, { signal: controller.signal }).then(async response => {
      if (controller.signal.aborted) return
      if (response.status === 404) { setSummaryState({ kind: 'missing' }); return }
      if (!response.ok) { setSummaryState({ kind: 'error' }); return }
      const value: unknown = await response.json()
      if (controller.signal.aborted) return
      const summary = readSummary(value)
      setSummaryState(summary === undefined ? { kind: 'error' } : { kind: 'ready', summary })
    }).catch(() => { if (!controller.signal.aborted) setSummaryState({ kind: 'error' }) })
    return () => controller.abort()
  }, [sessionId, seq, summaryAttempt])
  const files = summaryState.kind === 'ready' ? summaryState.summary.files : []
  const index = files[selected] === undefined ? 0 : selected
  const file = files[index]
  useEffect(() => {
    if (sessionId === undefined || file === undefined) return
    const controller = new AbortController()
    setDiff({ kind: 'loading' })
    const query = new URLSearchParams({ sessionId, seq: String(seq), index: String(index) })
    void fetch(`api/changes.diff?${query.toString()}`, { signal: controller.signal }).then(async response => {
      if (controller.signal.aborted) return
      if (response.status === 404) { setDiff({ kind: 'missing' }); return }
      if (!response.ok) { setDiff({ kind: 'error' }); return }
      const value: unknown = await response.json()
      if (!controller.signal.aborted) setDiff(readDiff(value))
    }).catch(() => { if (!controller.signal.aborted) setDiff({ kind: 'error' }) })
    return () => controller.abort()
  }, [sessionId, seq, file, index, diffAttempt])
  if (sessionId === undefined) return <p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.noSession')}</p>
  const selectedFile = file
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 210px) minmax(0, 1fr)', flex: 1, minHeight: 0 }}>
    <div role="group" aria-label={t('review.fileList')} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, borderRight: '0.5px solid var(--dsw-alias-border-l4)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '7px 8px 6px', color: 'var(--dsw-alias-label-secondary)', fontSize: 11, flex: 'none' }}>
        <span>{t('review.fileList')} {summaryState.kind === 'ready' ? String(summaryState.summary.files.length) : ''}</span>
        {summaryState.kind === 'ready' && <span style={{ marginLeft: 'auto', color: 'var(--dsw-alias-label-tertiary)' }}>+{String(summaryState.summary.added)} −{String(summaryState.summary.deleted)}</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 4px 6px' }}>
        {files.map((entry, position) => {
          const selected = position === index
          return <button type="button" key={`${entry.path}:${String(position)}`} aria-pressed={selected} title={entry.display} onClick={() => setSelected(position)} style={{
            display: 'flex', flexDirection: 'column', gap: 1, width: '100%', minWidth: 0, padding: '5px 6px', border: 'none', borderLeft: `2px solid ${selected ? 'var(--dsw-alias-label-accent, #2f81f7)' : 'transparent'}`,
            borderRadius: 4, background: selected ? 'var(--dsw-alias-bg-layer-3)' : 'transparent', color: selected ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)', cursor: 'pointer', font: 'inherit', fontSize: 11.5, textAlign: 'left',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, width: '100%' }}>
              <IconDeliverDocRegular size={13} />
              <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.display}</span>
            </span>
            <span style={{ display: 'flex', gap: 4, paddingLeft: 19, fontSize: 10.5 }}>{counts(entry, t)}</span>
          </button>
        })}
      </div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
      {selectedFile !== undefined && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 9px', borderBottom: '0.5px solid var(--dsw-alias-border-l4)', flex: 'none', minWidth: 0 }}>
        <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5 }}>{selectedFile.display}</strong>
        <span style={{ flex: 'none', display: 'flex', gap: 4 }}>{counts(selectedFile, t)}</span>
        {onOpenFile !== undefined && <button type="button" style={{ marginLeft: 'auto', flex: 'none', border: '0.5px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', font: 'inherit', fontSize: 11 }} onClick={() => onOpenFile(selectedFile.path)}>{t('review.openFile')}</button>}
      </div>}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {summaryState.kind === 'loading' && <p role="status" style={{ margin: 0, padding: 12 }}>{t('review.loading')}</p>}
        {summaryState.kind === 'missing' && <p role="status" style={{ margin: 0, padding: 12 }}>{t('review.missing')}</p>}
        {summaryState.kind === 'error' && <p role="alert" style={{ margin: 0, padding: 12 }}>{t('state.error')} <button type="button" onClick={() => setSummaryAttempt(current => current + 1)} style={{ marginLeft: 6, border: '0.5px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', borderRadius: 5, padding: '2px 7px', cursor: 'pointer', font: 'inherit', fontSize: 11 }}>{t('form.retry')}</button></p>}
        {summaryState.kind === 'ready' && summaryState.summary.files.length === 0 && <p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.empty')}</p>}
        {summaryState.kind === 'ready' && selectedFile !== undefined && (diff.kind === 'loading'
          ? <p role="status" style={{ margin: 0, padding: 12 }}>{t('diff.loading')}</p>
          : <div style={{ padding: '2px 4px' }}>{renderFactorySlot('deliverables.fileDiff', {
              state: diff.kind === 'text' ? diff
                : diff.kind === 'binary' ? { kind: 'binary' }
                  : diff.kind === 'oversized' ? { kind: 'oversized' }
                    : diff.kind,
              split: true, wrap: false,
              retry: () => { setDiffAttempt(current => current + 1) },
            }, { fallback: <p style={{ margin: 0, padding: 12 }}>{t('integrationUnavailable')}</p> })}</div>)}
      </div>
    </div>
  </div>
}
