/** Catalog projections for the Loom shell; pure functions with no Host runtime imports. */
import type { CatalogSnapshot, Lock, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-loom/types'
import type { BoardColumn, BoardTask } from './board.ts'
import { projectBoard } from './board.ts'

/** Board filter over task title, project and version. */
export interface ShellFilter {
  readonly projectId?: ProjectRecord['id']
  readonly versionId?: VersionRecord['id']
  readonly search?: string
}

/** One project lane with its version labels and business-state columns. */
export interface ProjectLane {
  readonly project: ProjectRecord
  readonly versions: readonly VersionRecord[]
  readonly columns: readonly BoardColumn[]
  readonly count: number
}

/** Counters rendered by the kanban metrics strip and context panel. */
export interface BoardMetrics {
  readonly cards: number
  readonly running: number
  readonly review: number
  readonly completed: number
  readonly activeSessions: number
}

/** One recent native Session row shown in the sidebar. */
export interface RecentSession {
  readonly id: string
  readonly title: string
  readonly cwd?: string
  readonly updatedAt: number
  readonly running: boolean
}

/** Minimal native Session list row consumed by the recent list. */
export interface RecentSessionInput {
  readonly id: string
  readonly displayTitle: string
  readonly cwd?: string
  readonly updatedAt: number
  readonly running: boolean
  /** Empty sessions add noise; the sidebar lists only started conversations. */
  readonly blank?: boolean
  /** Subagent Sessions are not user workbench conversations. */
  readonly origin?: 'subagent'
}

/** One running or attached Session with its owning task context. */
export interface ActiveSession {
  readonly task: TaskRecord
  readonly projectId: ProjectRecord['id']
  readonly versionId: VersionRecord['id']
  readonly sessionId: string
}

function matchProject(projectId: ProjectRecord['id'], filter: ShellFilter): boolean {
  return filter.projectId === undefined || projectId === filter.projectId
}

function matchingTasks(snapshot: CatalogSnapshot, filter: ShellFilter): BoardTask[] {
  const versions = new Map(snapshot.versions.map(version => [version.id, version]))
  return snapshot.tasks.filter((task) => {
    const version = versions.get(task.versionId)
    if (version === undefined) return false
    if (!matchProject(version.projectId, filter)) return false
    if (filter.versionId !== undefined && task.versionId !== filter.versionId) return false
    const query = filter.search?.trim().toLowerCase() ?? ''
    return query === '' || task.title.toLowerCase().includes(query)
  })
}

/** Group matching tasks by project for the kanban swimlanes.
 * @param snapshot - Authoritative catalog snapshot.
 * @param filter - Project, version and title constraints.
 * @returns every project lane that has a version, with empty columns retained.
 */
export function projectLanes(snapshot: CatalogSnapshot, filter: ShellFilter): ProjectLane[] {
  const selected = snapshot.projects.filter(project => matchProject(project.id, filter))
  const tasks = matchingTasks(snapshot, filter)
  return selected.map((project) => {
    const versions = snapshot.versions.filter(version => version.projectId === project.id)
    const versionIds = new Set(versions.map(version => version.id))
    const laneTasks = tasks.filter(task => versionIds.has(task.versionId))
    const columns = projectBoard(laneTasks, filter.search === undefined ? {} : { search: filter.search })
    return { project, versions, columns, count: laneTasks.length }
  })
}

/** Project matching tasks into one flat five-column board.
 * @param snapshot - Authoritative catalog snapshot.
 * @param filter - Project, version and title constraints.
 * @returns the five status columns shared by every project.
 */
export function flatBoard(snapshot: CatalogSnapshot, filter: ShellFilter): BoardColumn[] {
  return projectBoard(matchingTasks(snapshot, filter), filter.search === undefined ? {} : { search: filter.search })
}

/** Count the cards and Sessions the shell must show.
 * @param snapshot - Authoritative catalog snapshot.
 * @param filter - Project and version constraints for card counters.
 * @returns counters independent of the flat/grouped display mode.
 */
export function boardMetrics(snapshot: CatalogSnapshot, filter: ShellFilter): BoardMetrics {
  const tasks = matchingTasks(snapshot, filter)
  const sessions = boundSessions(snapshot).filter((session) => {
    const version = snapshot.versions.find(candidate => candidate.id === session.versionId)
    return version !== undefined && matchProject(version.projectId, filter)
      && (filter.versionId === undefined || session.versionId === filter.versionId)
  })
  return {
    cards: tasks.length,
    running: tasks.filter(task => task.status === 'running').length,
    review: tasks.filter(task => task.status === 'review').length,
    completed: tasks.filter(task => task.status === 'completed').length,
    activeSessions: sessions.filter(session => session.task.status === 'running').length,
  }
}

/** List every Session attached to a task attempt.
 * @param snapshot - Authoritative catalog snapshot.
 * @returns one row per attached Session, in task and attempt order.
 */
export function boundSessions(snapshot: CatalogSnapshot): ActiveSession[] {
  const versions = new Map(snapshot.versions.map(version => [version.id, version]))
  const rows: ActiveSession[] = []
  for (const task of snapshot.tasks) {
    const version = versions.get(task.versionId)
    if (version === undefined) continue
    for (const attempt of task.attempts) for (const sessionId of attempt.sessionIds) rows.push({ task, projectId: version.projectId, versionId: version.id, sessionId })
  }
  return rows
}

/** Last path segment of a workspace path; empty for a missing path.
 * @param cwd - absolute workspace path from the native Session list.
 * @returns the basename used as the workspace label.
 */
export function workspaceName(cwd: string | undefined): string | undefined {
  if (cwd === undefined) return undefined
  const trimmed = cwd.replace(/[\\/]+$/u, '')
  if (trimmed === '') return undefined
  const name = trimmed.split(/[\\/]/u).at(-1)
  return name === undefined || name === '' ? undefined : name
}

/** Most recent loose Sessions, bound Sessions excluded.
 * @param rows - native Session list rows in host order.
 * @param bound - Session ids attached to a Loom task attempt.
 * @param search - case-insensitive title filter.
 * @param limit - maximum rows returned, newest first.
 * @returns at most `limit` rows sorted by descending update time.
 */
export function recentSessions(rows: readonly RecentSessionInput[], bound: ReadonlySet<string>, search: string, limit = 5): RecentSession[] {
  const query = search.trim().toLowerCase()
  return rows
    .filter(row => !bound.has(row.id) && row.blank !== true && row.origin !== 'subagent' && (query === '' || row.displayTitle.toLowerCase().includes(query)))
    .slice()
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit)
    .map(row => ({ id: row.id, title: row.displayTitle, ...(row.cwd === undefined ? {} : { cwd: row.cwd }), updatedAt: row.updatedAt, running: row.running }))
}

/** Count distinct workspaces used by a running task.
 * @param snapshot - Authoritative catalog snapshot.
 * @returns distinct running workspace ids.
 */
export function activeWorkspaceCount(snapshot: CatalogSnapshot): number {
  const ids = new Set<string>()
  for (const task of snapshot.tasks) {
    if (task.status !== 'running') continue
    for (const attempt of task.attempts) ids.add(attempt.workspaceId)
  }
  return ids.size
}

/** Resolve the Lock pinned by a task's latest attempt.
 * @param snapshot - Authoritative catalog snapshot.
 * @param task - Task whose current baseline is requested.
 * @returns the attempt Lock, or undefined before the first execution.
 */
export function currentLock(snapshot: CatalogSnapshot, task: TaskRecord | undefined): Lock | undefined {
  const lockId = task?.attempts.at(-1)?.lock.id
  return lockId === undefined ? undefined : snapshot.locks.find(lock => lock.id === lockId)
}

/** Resolve the workspace used by a task's latest attempt.
 * @param snapshot - Authoritative catalog snapshot.
 * @param task - Task whose current workspace is requested.
 * @returns the workspace record, or undefined before the first execution.
 */
export function currentWorkspace(snapshot: CatalogSnapshot, task: TaskRecord | undefined) {
  const workspaceId = task?.attempts.at(-1)?.workspaceId
  return workspaceId === undefined ? undefined : snapshot.workspaces.find(workspace => workspace.id === workspaceId)
}
