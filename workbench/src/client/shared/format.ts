/** Join CSS-module class candidates, dropping falsy entries. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** Render a tabular count with locale separators. */
export function fmt(value: number): string {
  return value.toLocaleString()
}

/** Format an RFC 3339 instant as a local HH:mm label. */
export function hhmmOf(instant: string): string {
  const date = new Date(instant)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Compact million/thousand label for the resource strip. */
export function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`
  return String(value)
}
