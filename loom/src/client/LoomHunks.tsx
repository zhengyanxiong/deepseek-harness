/** Loom-owned unified diff body for workspace comparisons. */
import type { CSSProperties, ReactNode } from 'react'
import type { WorkspaceFileChangeRecord } from 'dsh-workloom/types'
import type { LoomFileDiffInput } from './LoomDiff.tsx'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** One rendered unified-diff line with its source and target line numbers. */
export interface DiffRow {
  readonly kind: 'add' | 'del' | 'context'
  readonly oldLine: number | undefined
  readonly newLine: number | undefined
  readonly text: string
}

/**
 * Expand unified hunks into rows carrying absolute line numbers.
 * @param hunks - Git unified hunks with absolute starts.
 * @returns every rendered line in hunk order.
 */
export function hunkRows(hunks: WorkspaceFileChangeRecord['hunks']): readonly DiffRow[] {
  const rows: DiffRow[] = []
  for (const hunk of hunks) {
    let oldLine = hunk.oldStart
    let newLine = hunk.newStart
    for (const line of hunk.lines) {
      const marker = line[0]
      const text = line.slice(1)
      if (marker === '+') { rows.push({ kind: 'add', oldLine: undefined, newLine, text }); newLine += 1 }
      else if (marker === '-') { rows.push({ kind: 'del', oldLine, newLine: undefined, text }); oldLine += 1 }
      else if (marker === '\\') continue
      else { rows.push({ kind: 'context', oldLine, newLine, text }); oldLine += 1; newLine += 1 }
    }
  }
  return rows
}

const body: CSSProperties = { minHeight: 0, height: '100%', overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 11.5, lineHeight: 1.55, background: 'var(--dsw-alias-bg-layer-1)' }
const rowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '42px 42px 1fr', minWidth: 0 }
const numberStyle: CSSProperties = { padding: '0 6px', textAlign: 'right', color: 'var(--dsw-alias-label-tertiary)', userSelect: 'none', borderRight: '0.5px solid var(--dsw-alias-border-l4)', whiteSpace: 'nowrap' }
const codeStyle: CSSProperties = { padding: '0 8px', whiteSpace: 'pre', tabSize: 2 }

/**
 * Render a native-shaped unified diff without depending on a DSH client package.
 * @param props - diff state, wrapping choice and dictionary.
 * @returns the hunk body, or a localized stand-in for an unrenderable state.
 */
export function LoomHunks({ state, wrap, t }: { readonly state: LoomFileDiffInput['state']; readonly wrap: boolean; readonly t: Translate }): ReactNode {
  if (state === 'missing') return <p style={{ margin: 0, padding: 12 }}>{t('diff.previewMissing')}</p>
  if (state === 'error') return <p style={{ margin: 0, padding: 12 }} role="alert">{t('state.error')}</p>
  if (state === 'loading') return <p style={{ margin: 0, padding: 12 }} role="status">{t('diff.loading')}</p>
  if (state.kind === 'binary') return <p style={{ margin: 0, padding: 12 }}>{t('review.binary')}</p>
  if (state.kind === 'oversized') return <p style={{ margin: 0, padding: 12 }}>{t('review.oversized')}</p>
  return <div role="table" aria-label={t('diff.preview')} style={body}>
    {state.hunks.map((hunk, index) => {
      const rows = hunkRows([hunk])
      return <div key={`${String(index)}:${String(hunk.oldStart)}`} role="rowgroup">
        <div style={{ ...rowStyle, background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-secondary)' }}>
          <span style={numberStyle} />
          <span style={numberStyle} />
          <span style={{ ...codeStyle, padding: '2px 8px' }}>{`@@ -${String(hunk.oldStart)},${String(hunk.oldLines)} +${String(hunk.newStart)},${String(hunk.newLines)} @@`}</span>
        </div>
        {rows.map((row, rowIndex) => <div key={rowIndex} role="row" style={{ ...rowStyle, background: row.kind === 'add' ? 'rgba(46,160,67,.12)' : row.kind === 'del' ? 'rgba(248,81,73,.12)' : 'transparent' }}>
          <span style={numberStyle}>{row.oldLine === undefined ? '' : String(row.oldLine)}</span>
          <span style={numberStyle}>{row.newLine === undefined ? '' : String(row.newLine)}</span>
          <span style={{ ...codeStyle, ...(wrap ? { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } : {}) }}>{row.text}</span>
        </div>)}
      </div>
    })}
  </div>
}
