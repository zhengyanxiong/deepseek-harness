/** Workloom's woven-W artwork for the sidebar monogram and the panel brand. */
import { useId } from 'react'

/** A single-color mark that inherits the surrounding text color. */
export interface LoomMarkProps {
  /** Rendered square size in pixels. */
  readonly size?: number
}

/** The woven-W geometry used by the single-color mark. */
const MARK_PATH = 'M8.5 9.5 L13.5 26.5 L18 16 L22.5 26.5 L27.5 9.5'

/** The two crossing strands used by the colored brand mark. */
const LEFT_STRAND = 'M8.5 9.5 L13.5 26.5 L19.1 14.6'
const RIGHT_STRAND = 'M16.9 17.4 L22.5 26.5 L27.5 9.5'

/**
 * Draw the Workloom monogram in the current text color.
 * @param props - rendered square size.
 * @returns a decorative woven-W SVG.
 */
export function LoomMark({ size = 16 }: LoomMarkProps) {
  return <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
    <path d={MARK_PATH} stroke="currentColor" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

/** A two-tone mark for the panel header and plugin artwork. */
export interface LoomBrandMarkProps {
  /** Rendered square size in pixels. */
  readonly size?: number
}

/**
 * Draw the Workloom monogram with its two woven strands in contrasting colors.
 * @param props - rendered square size.
 * @returns a decorative woven-W SVG with per-instance gradient identifiers.
 */
export function LoomBrandMark({ size = 22 }: LoomBrandMarkProps) {
  const id = useId().replaceAll(':', '')
  const left = `loom_left_${id}`
  const right = `loom_right_${id}`
  return <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
    <path d={RIGHT_STRAND} stroke={`url(#${right})`} strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d={LEFT_STRAND} stroke={`url(#${left})`} strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
    <defs>
      <linearGradient id={left} x1="8" y1="9" x2="20" y2="18" gradientUnits="userSpaceOnUse">
        <stop stopColor="#A78BFA" />
        <stop offset="1" stopColor="#6D5EF8" />
      </linearGradient>
      <linearGradient id={right} x1="16" y1="15" x2="28" y2="27" gradientUnits="userSpaceOnUse">
        <stop stopColor="#4F8CFF" />
        <stop offset="1" stopColor="#2DD4BF" />
      </linearGradient>
    </defs>
  </svg>
}
