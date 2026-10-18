/** Shared changed-file row used by the bottom Diff tree and the turn review list. */
import type { ReactNode } from 'react'
import { IconDeliverDocRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** The line counts and file-kind flags one changed-file row shows. */
export interface LoomFileMeta {
  /** Path shown by the row; the caller chooses a basename or a full path. */
  readonly display: string
  /** Lines added in this comparison. */
  readonly added: number
  /** Lines deleted in this comparison. */
  readonly deleted: number
  /** The file has no text comparison. */
  readonly binary?: boolean
  /** The file was too large for a comparison. */
  readonly oversized?: boolean
}

/** Inputs for the shared added/deleted labels. */
export interface LoomFileCountsProps {
  readonly file: LoomFileMeta
  readonly t: Translate
}

/**
 * Draw one file's added/deleted counts or its non-text label.
 * @param props - the file metadata and localized copy.
 * @returns Git-style added/deleted labels for the row end.
 */
export function LoomFileCounts({ file, t }: LoomFileCountsProps): ReactNode {
  if (file.binary === true) return <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{t('review.binary')}</span>
  if (file.oversized === true) return <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{t('review.oversized')}</span>
  return <span style={{ display: 'inline-flex', gap: 4, whiteSpace: 'nowrap' }}>
    <span style={{ color: 'var(--dsw-alias-state-success-primary)' }}>+{String(file.added)}</span>
    <span style={{ color: 'var(--dsw-alias-state-error-primary)' }}>−{String(file.deleted)}</span>
  </span>
}

/** Inputs for one shared changed-file row. */
export interface LoomFileRowProps extends LoomFileMeta {
  /** Localized copy for labels. */
  readonly t: Translate
  /** Whether this row is the selected comparison. */
  readonly selected: boolean
  /** Tree depth used for indentation; zero in the flat review list. */
  readonly depth?: number
  /** Full path shown by the hover title when `display` is shortened. */
  readonly title?: string
  /** Select this file. */
  readonly onClick: () => void
}

/**
 * Draw one selectable file with an icon, a path, and its counts at the row end.
 * @param props - file metadata, selection state, indentation, and the select callback.
 * @returns a single-line file button shared by both file lists.
 */
export function LoomFileRow({ display, added, deleted, binary, oversized, t, selected, depth = 0, title, onClick }: LoomFileRowProps): ReactNode {
  return <button type="button" aria-pressed={selected} title={title ?? display} onClick={onClick} style={{
    display: 'flex', alignItems: 'center', gap: 6, width: '100%', minWidth: 0, padding: `5px 6px 5px ${String(6 + depth * 14)}px`,
    border: 'none', borderLeft: `2px solid ${selected ? 'var(--dsw-alias-label-accent, #2f81f7)' : 'transparent'}`, borderRadius: 4,
    background: selected ? 'var(--dsw-alias-bg-layer-3)' : 'transparent', color: selected ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
    cursor: 'pointer', font: 'inherit', fontSize: 11.5, textAlign: 'left',
  }}>
    <span style={{ display: 'flex', flex: 'none' }}><IconDeliverDocRegular size={13} /></span>
    <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</span>
    <span style={{ flex: 'none', fontSize: 10.5 }}><LoomFileCounts file={{ display, added, deleted, ...binary === true ? { binary: true } : {}, ...oversized === true ? { oversized: true } : {} }} t={t} /></span>
  </button>
}
