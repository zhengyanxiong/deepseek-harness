/** Kanban columns over authoritative task records, with no mock data. */
import { createElement, type CSSProperties } from 'react'
import type { BoardColumn, BoardFilter, BoardTask } from './board.ts'
import { projectBoard } from './board.ts'
import type { LoomKey } from './locales.ts'

const STATUS_KEY = {
  pending: 'task.status.pending',
  running: 'task.status.running',
  review: 'task.status.review',
  completed: 'task.status.completed',
  failed: 'task.status.failed',
} as const satisfies Record<BoardTask['status'], LoomKey>

/** Props for the task board; every task comes from the Host catalog. */
export interface TaskBoardProps {
  readonly tasks: readonly BoardTask[]
  readonly filter: BoardFilter
  readonly t: (key: LoomKey) => string
  readonly onSelect: (task: BoardTask) => void
}

const column: CSSProperties = { flex: '1 0 160px', minWidth: 160, display: 'flex', flexDirection: 'column', gap: 8 }
const card: CSSProperties = { textAlign: 'left', width: '100%', padding: 8, cursor: 'pointer', overflowWrap: 'anywhere' }

/** Render the five business-state columns, retaining empty columns.
 * @param props - Catalog tasks, board filter, locale lookup, and selection handler.
 * @returns the board without changing task status from Session activity.
 */
export function TaskBoard({ tasks, filter, t, onSelect }: TaskBoardProps) {
  return createElement('div', { style: { display: 'flex', gap: 12, alignItems: 'flex-start' } },
    projectBoard(tasks, filter).map(({ status, tasks: rows }: BoardColumn) => createElement('section', { key: status, style: column },
      createElement('h3', { style: { margin: 0, fontSize: 13 } }, `${t(STATUS_KEY[status])} (${String(rows.length)})`),
      rows.map(task => createElement('button', { key: task.id, type: 'button', style: card, onClick: () => { onSelect(task) } },
        createElement('span', { style: { display: 'block', fontWeight: 500 } }, task.title),
        createElement('span', { style: { fontSize: 12, opacity: 0.7 } }, `${String(task.attempts.length)}`))),
    )))
}
