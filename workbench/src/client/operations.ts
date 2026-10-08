/** Workbench operation drafts and validation, independent of Session mutation. */
export type OperationKind = 'new-session' | 'run-workflow' | 'new-job' | 'add-todo' | 'set-reminder'

/** User-owned fields retained while switching operation panels. */
export interface OperationDraft {
  content: string
  date: string
  time: string
  repeat: 'once' | 'daily'
}

/** Create an empty draft; do not guess a reminder date on behalf of the user. */
export function emptyOperationDraft(): OperationDraft {
  return { content: '', date: '', time: '', repeat: 'once' }
}

/** Validate fields before preparing a request for the native composer. */
export function validateOperation(kind: OperationKind, draft: OperationDraft, now: number): 'content' | 'time' | undefined {
  if (draft.content.trim() === '') return 'content'
  if (kind !== 'set-reminder') return undefined
  const instant = reminderInstant(draft)
  if (instant === undefined || instant.getTime() <= now) return 'time'
  return undefined
}

/** Resolve a browser-local time, rejecting normalized dates and DST gaps. */
export function reminderInstant(draft: OperationDraft): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !/^\d{2}:\d{2}$/.test(draft.time)) return undefined
  const date = new Date(`${draft.date}T${draft.time}:00`)
  if (!Number.isFinite(date.getTime())) return undefined
  const pad = (value: number): string => String(value).padStart(2, '0')
  const roundtrip = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  return roundtrip === `${draft.date}T${draft.time}` ? date : undefined
}
