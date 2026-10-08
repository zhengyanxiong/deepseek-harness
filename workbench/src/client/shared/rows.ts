import type { JobId } from '@deepseek-ai/dsh-jobs/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule/client'
import type { WorkbenchKey } from '../locales.ts'

/** Read-only host reminder catalog snapshot. */
export interface RemindersSnapshot {
  records: readonly ScheduleCatalogEntry[]
  status: 'loading' | 'ready' | 'error'
}

/** One row of the 进行中 summary: a session or a live job. */
export interface OngoingRow {
  readonly key: string
  readonly kind: 'session' | 'job'
  readonly title: string
  readonly meta: string
  readonly running: boolean
  readonly sessionId: SessionId
  readonly jobId?: JobId
}

/** One row of the 今日提醒 / 到期目标 summary. */
export interface TodayRow {
  readonly key: string
  readonly kind: 'reminder' | 'goal'
  readonly title: string
  readonly meta: string
  readonly tone: 'info' | 'warning' | 'danger' | 'neutral' | 'success'
  readonly tag: string
  readonly sessionId: SessionId | undefined
}

/** Job row with its owning session context. */
export interface JobRowContext {
  job: {
    readonly id: JobId
    readonly kind: string
    readonly label: string
    readonly status: 'running' | 'stopping' | 'completed' | 'killed' | 'failed'
    readonly progress?: string
    readonly detail?: string
  }
  sessionTitle: string
  sessionId: SessionId
}

/** Goal row with its owning session context. */
export interface GoalRowContext {
  id: SessionId
  title: string
  objective: string
  goalPhase: string
  rounds: number
}

/** One token/context row (kept from the read-only dashboard). */
export interface TokenRowContext {
  id: SessionId
  title: string
  total?: number | undefined
  percent?: number | undefined
}

/** Session summary slice the cards read (structural subset of the host row). */
export interface DashboardSessionSummary {
  displayTitle: string
  running: boolean
  /** Blank sessions (no durable title yet) are workspace shells; the overview hides them. */
  blank: boolean
  projectionValues?: {
    subagentCatalog?: readonly { id: string; mode: string; label?: string }[]
    agentTeam?: { members: readonly { id: string; name: string; role: string; phase: string }[] }
  }
}

/** Locale key per durable goal phase. */
export const GOAL_PHASE_KEY: Record<string, WorkbenchKey> = {
  active: 'goals.phase.active',
  paused: 'goals.phase.paused',
  blocked: 'goals.phase.blocked',
  complete: 'goals.phase.complete',
}

/** Tag tone per durable goal phase. */
export const GOAL_PHASE_TONE: Record<string, 'info' | 'warning' | 'danger' | 'success'> = {
  active: 'info',
  paused: 'warning',
  blocked: 'danger',
  complete: 'success',
}
