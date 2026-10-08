/**
 * The eight data-source cards carried over from the read-only dashboard
 * (design §3: 现有卡片的分页器保留), with rows upgraded from read-only to
 * clickable: session/job/workflow/goal/reminder rows open their session, live
 * jobs expose a hover-revealed stop action.
 */

import { useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Button, IconAlarmClockOutlineRegular, IconBranchOutlineRegular, IconGaugeOutlineRegular,
  IconGoalOutlineRegular, IconNewChatOutlineRegular, IconQueueOutlineRegular, IconStopFillRegular,
  IconUserOutlineRegular, IconUsersOutlineRegular, StateDot, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { JobId } from '@deepseek-ai/dsh-jobs/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { fmt } from '../shared/format.ts'
import { Card, PAGE_SIZE, pagerFooter, usePagination, PAGE_SIZE_LARGE } from '../shared/presentation.tsx'
import { GOAL_PHASE_KEY, GOAL_PHASE_TONE } from '../shared/rows.ts'
import type { DashboardSessionSummary, GoalRowContext, JobRowContext, RemindersSnapshot, TokenRowContext } from '../shared/rows.ts'
import type { WorkbenchKey } from '../locales.ts'
import css from '../WorkbenchPanel.module.css'

/** Props for the eight-card dashboard. */
export interface DashboardCardsProps {
  t(key: WorkbenchKey): string
  sessions: {
    readonly ids: readonly SessionId[]
    readonly byId: Readonly<Record<SessionId, DashboardSessionSummary | undefined>>
    readonly phase: string
  }
  jobRows: readonly JobRowContext[]
  workflowRows: readonly JobRowContext[]
  goalRows: readonly GoalRowContext[]
  reminders: RemindersSnapshot
  tokenRows: readonly TokenRowContext[]
  tokenTotals: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
  onOpenSession(sessionId: SessionId): void
  onStopJob(sessionId: SessionId, jobId: JobId): void
}

const JOB_DOT = {
  running: 'ongoing',
  stopping: 'ongoing',
  completed: 'done',
  killed: 'idle',
  failed: 'error',
} as const

const SUBAGENT_MODE_KEY: Record<string, WorkbenchKey> = {
  'one-shot': 'subagents.mode.one-shot',
  'continuable': 'subagents.mode.continuable',
  'unknown': 'subagents.mode.unknown',
}

const SUBAGENT_MODE_TONE: Record<string, 'neutral' | 'info' | 'outline'> = {
  'one-shot': 'neutral',
  'continuable': 'info',
  'unknown': 'outline',
}

const TEAM_ROLE_KEY: Record<string, WorkbenchKey> = {
  lead: 'teams.role.lead',
  teammate: 'teams.role.teammate',
}

const TEAM_ROLE_TONE: Record<string, 'info' | 'neutral'> = {
  lead: 'info',
  teammate: 'neutral',
}

const TEAM_PHASE_KEY: Record<string, WorkbenchKey> = {
  provisioning: 'teams.phase.provisioning',
  active: 'teams.phase.active',
  failed: 'teams.phase.failed',
}

const TEAM_PHASE_TONE: Record<string, 'warning' | 'success' | 'danger'> = {
  provisioning: 'warning',
  active: 'success',
  failed: 'danger',
}

/** A clickable row shell shared by every list card. */
function ClickableRow({ dot, title, meta, sessionId, actions, onOpen, children }: {
  dot?: ReactNode
  title: string
  meta?: string | undefined
  sessionId: SessionId
  actions?: ReactNode
  onOpen(sessionId: SessionId): void
  children?: ReactNode
}) {
  return (
    <div className={css.rowClickable} role="button" tabIndex={0}
      onClick={() => { onOpen(sessionId) }}
      onKeyDown={event => { if (event.key === 'Enter') onOpen(sessionId) }}>
      {dot}
      <div className={css.rowMain}>
        <span className={css.rowTitle}>{title}</span>
        {meta !== undefined && <span className={css.rowMeta}>{meta}</span>}
      </div>
      {actions !== undefined && <div className={css.rowActions}>{actions}</div>}
      {children}
    </div>
  )
}

/** The hover-revealed stop action for a live job row. */
function StopAction({ label, onStop }: { label: string; onStop(): void }) {
  return (
    <Button variant="ghost" size="sm" aria-label={label} onClick={event => { event.stopPropagation(); onStop() }}
      icon={<IconStopFillRegular size={13} />} />
  )
}

/**
 * Render the eight data-source cards.
 * @param props - locale, snapshots, and the open/stop actions.
 * @returns the card grid.
 */
export function DashboardCards(props: DashboardCardsProps) {
  const { t, sessions, jobRows, workflowRows, goalRows, reminders, tokenRows, tokenTotals, onOpenSession, onStopJob } = props
  const { ids, byId, phase } = sessions

  const sessionRows = useMemo(() => ids.flatMap(id => {
    const summary = byId[id]
    return summary === undefined || summary.blank ? [] : [{ id, displayTitle: summary.displayTitle, running: summary.running }]
  }), [ids, byId])

  const subagentRows = useMemo(() => ids.flatMap(parentId => {
    const summary = byId[parentId]
    const catalog = summary?.projectionValues?.subagentCatalog
    if (summary === undefined || catalog === undefined) return []
    return catalog.map(child => ({ child, parentId }))
  }), [ids, byId])

  const teamRows = useMemo(() => ids.flatMap(leadId => {
    const summary = byId[leadId]
    const team = summary?.projectionValues?.agentTeam
    if (summary === undefined || team === undefined) return []
    return team.members.map(member => ({ member, leadId }))
  }), [ids, byId])

  const sessionsPage = usePagination(sessionRows, PAGE_SIZE_LARGE)
  const jobsPage = usePagination(jobRows, PAGE_SIZE)
  const workflowPage = usePagination(workflowRows, PAGE_SIZE)
  const goalsPage = usePagination(goalRows, PAGE_SIZE)
  const remindersPage = usePagination(reminders.records, PAGE_SIZE)
  const subagentsPage = usePagination(subagentRows, PAGE_SIZE)
  const teamsPage = usePagination(teamRows, PAGE_SIZE)
  const tokensPage = usePagination(tokenRows, PAGE_SIZE)

  const prevLabel = t('pager.prev')
  const nextLabel = t('pager.next')

  const jobRow = (entry: JobRowContext): ReactNode => {
    const { job, sessionTitle, sessionId } = entry
    const live = job.status === 'running' || job.status === 'stopping'
    const detail = live ? (job.progress ?? t('jobs.running')) : (job.detail ?? t('jobs.done'))
    return (
      <ClickableRow key={job.id} dot={<StateDot className={css.rowDot} state={JOB_DOT[job.status]} />}
        title={job.label} meta={`${sessionTitle} · ${detail}`} sessionId={sessionId}
        actions={live ? <StopAction label={t('ongoing.stop')} onStop={() => { onStopJob(sessionId, job.id) }} /> : undefined}
        onOpen={onOpenSession} />
    )
  }

  return (
    <div className={css.grid}>
      <Card wide icon={<IconNewChatOutlineRegular size={16} />} title={t('sessions.title')} count={sessionRows.length}
        footer={pagerFooter(sessionsPage, prevLabel, nextLabel)}>
        {phase === 'pending'
          ? <p className={css.empty}>{t('sessions.loading')}</p>
          : sessionsPage.pageItems.length === 0
            ? <p className={css.empty}>{t('sessions.empty')}</p>
            : sessionsPage.pageItems.map(row => (
              <ClickableRow key={row.id} dot={<StateDot className={css.rowDot} state={row.running ? 'ongoing' : 'idle'} />}
                title={row.displayTitle} meta={row.running ? t('sessions.running') : undefined}
                sessionId={row.id} onOpen={onOpenSession} />
            ))}
      </Card>

      <Card icon={<IconQueueOutlineRegular size={16} />} title={t('jobs.title')} count={jobRows.length}
        footer={pagerFooter(jobsPage, prevLabel, nextLabel)}>
        {jobsPage.pageItems.length === 0
          ? <p className={css.empty}>{t('jobs.empty')}</p>
          : jobsPage.pageItems.map(jobRow)}
      </Card>

      <Card icon={<IconBranchOutlineRegular size={16} />} title={t('workflow.title')} count={workflowRows.length}
        footer={pagerFooter(workflowPage, prevLabel, nextLabel)}>
        {workflowPage.pageItems.length === 0
          ? <p className={css.empty}>{t('workflow.empty')}</p>
          : workflowPage.pageItems.map(jobRow)}
      </Card>

      <Card icon={<IconGoalOutlineRegular size={16} />} title={t('goals.title')} count={goalRows.length}
        footer={pagerFooter(goalsPage, prevLabel, nextLabel)}>
        {goalsPage.pageItems.length === 0
          ? <p className={css.empty}>{t('goals.empty')}</p>
          : goalsPage.pageItems.map(row => (
            <ClickableRow key={row.id} title={row.objective} meta={row.title} sessionId={row.id} onOpen={onOpenSession}>
              <div className={css.rowSide}>
                <Tag tone={GOAL_PHASE_TONE[row.goalPhase] ?? 'neutral'}>{t(GOAL_PHASE_KEY[row.goalPhase] ?? 'goals.phase.active')}</Tag>
              </div>
            </ClickableRow>
          ))}
      </Card>

      <Card icon={<IconAlarmClockOutlineRegular size={16} />} title={t('reminders.title')} count={reminders.records.length}
        footer={pagerFooter(remindersPage, prevLabel, nextLabel)}>
        {reminders.status === 'loading'
          ? <p className={css.empty}>{t('reminders.loading')}</p>
          : reminders.status === 'error'
            ? <p className={css.empty}>{t('reminders.error')}</p>
            : remindersPage.pageItems.length === 0
              ? <p className={css.empty}>{t('reminders.empty')}</p>
              : remindersPage.pageItems.map(reminder => (
                <ClickableRow key={String(reminder.id)} title={reminder.title}
                  meta={byId[reminder.sessionId]?.displayTitle ?? String(reminder.sessionId)}
                  sessionId={reminder.sessionId} onOpen={onOpenSession}>
                  <div className={css.rowSide}>
                    <Tag tone={reminder.status === 'active' ? 'info' : 'neutral'}>
                      {t(reminder.status === 'active' ? 'reminders.active' : 'reminders.inactive')}
                    </Tag>
                  </div>
                </ClickableRow>
              ))}
      </Card>

      <Card icon={<IconUserOutlineRegular size={16} />} title={t('subagents.title')} count={subagentRows.length}
        footer={pagerFooter(subagentsPage, prevLabel, nextLabel)}>
        {subagentsPage.pageItems.length === 0
          ? <p className={css.empty}>{t('subagents.empty')}</p>
          : subagentsPage.pageItems.map(({ child, parentId }) => (
            <ClickableRow key={child.id} title={child.label ?? child.id} meta={byId[parentId]?.displayTitle ?? parentId}
              sessionId={parentId} onOpen={onOpenSession}>
              <div className={css.rowSide}>
                <Tag tone={SUBAGENT_MODE_TONE[child.mode] ?? 'outline'}>{t(SUBAGENT_MODE_KEY[child.mode] ?? 'subagents.mode.unknown')}</Tag>
              </div>
            </ClickableRow>
          ))}
      </Card>

      <Card icon={<IconUsersOutlineRegular size={16} />} title={t('teams.title')} count={teamRows.length}
        footer={pagerFooter(teamsPage, prevLabel, nextLabel)}>
        {teamsPage.pageItems.length === 0
          ? <p className={css.empty}>{t('teams.empty')}</p>
          : teamsPage.pageItems.map(({ member, leadId }) => (
            <ClickableRow key={member.id} title={member.name} meta={byId[leadId]?.displayTitle ?? leadId}
              sessionId={leadId} onOpen={onOpenSession}>
              <div className={css.rowSide}>
                <Tag tone={TEAM_ROLE_TONE[member.role] ?? 'neutral'}>{t(TEAM_ROLE_KEY[member.role] ?? 'teams.role.teammate')}</Tag>
                <Tag tone={TEAM_PHASE_TONE[member.phase] ?? 'neutral'}>{t(TEAM_PHASE_KEY[member.phase] ?? 'teams.phase.active')}</Tag>
              </div>
            </ClickableRow>
          ))}
      </Card>

      <Card wide icon={<IconGaugeOutlineRegular size={16} />} title={t('tokens.title')} count={tokenRows.length}
        footer={pagerFooter(tokensPage, prevLabel, nextLabel)}>
        {tokenTotals.total === 0 && tokenRows.length === 0
          ? <p className={css.empty}>{t('tokens.empty')}</p>
          : (
            <>
              <div className={css.metricGrid}>
                <div className={css.metric}>
                  <span className={css.metricValue}>{fmt(tokenTotals.input)}</span>
                  <span className={css.metricLabel}>{t('tokens.input')}</span>
                </div>
                <div className={css.metric}>
                  <span className={css.metricValue}>{fmt(tokenTotals.output)}</span>
                  <span className={css.metricLabel}>{t('tokens.output')}</span>
                </div>
                <div className={css.metric}>
                  <span className={css.metricValue}>{fmt(tokenTotals.cacheRead)}</span>
                  <span className={css.metricLabel}>{t('tokens.cacheRead')}</span>
                </div>
                <div className={css.metric}>
                  <span className={css.metricValue}>{fmt(tokenTotals.cacheWrite)}</span>
                  <span className={css.metricLabel}>{t('tokens.cacheWrite')}</span>
                </div>
              </div>
              {tokensPage.pageItems.map(row => (
                <div key={row.id} className={css.barRow}>
                  <div className={css.barMain}>
                    <div className={css.barHead}>
                      <span className={css.rowTitle}>{row.title}</span>
                      {row.total !== undefined && <span className={css.rowMeta}>{fmt(row.total)}</span>}
                    </div>
                    {row.percent !== undefined && (
                      <div className={css.barTrack}>
                        <div className={css.barFill} style={{ '--bar-width': `${row.percent}%` } as CSSProperties} />
                      </div>
                    )}
                  </div>
                  {row.percent !== undefined && <span className={css.barPercent}>{row.percent}%</span>}
                </div>
              ))}
            </>
          )}
      </Card>
    </div>
  )
}
