/** Pure board projection; native Session activity never changes task business status. */
import type { Task, TaskStatus } from '../domain/task.ts'

/** Task metadata displayed by the board without importing Host runtime modules. */
export interface BoardTask extends Task { readonly title: string }
/** Board filtering uses fixed version membership and a title query. */
export interface BoardFilter { readonly versionId?: Task['versionId']; readonly search?: string }
/** A business-state column, retained even when it has no matching tasks. */
export interface BoardColumn { readonly status: TaskStatus; readonly tasks: readonly BoardTask[] }

/** Project task records into ordered business-state columns.
 * @param tasks - Authoritative catalog task records.
 * @param filter - Optional version and case-insensitive title search.
 * @returns all five columns without modifying the input records.
 */
export function projectBoard(tasks: readonly BoardTask[], filter: BoardFilter): BoardColumn[] {
  const query = filter.search?.trim().toLowerCase() ?? ''
  const matching = tasks.filter(task => (filter.versionId === undefined || task.versionId === filter.versionId) && task.title.toLowerCase().includes(query))
  const statuses: TaskStatus[] = ['pending', 'running', 'review', 'completed', 'failed']
  return statuses.map(status => ({ status, tasks: matching.filter(task => task.status === status) }))
}
