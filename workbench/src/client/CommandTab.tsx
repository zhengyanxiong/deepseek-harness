/**
 * 指挥台 (design §3): quick actions generated from the command registry, the
 * 进行中 / 今日提醒·到期目标 summary columns, the eight clickable data-source
 * cards, the resource strip, and the composer seat (workspace picker chrome +
 * the host-native InputBar, supplied by the panel as a ReactNode).
 */

import type { ReactNode } from 'react'
import {
  Button, IconRightUpOutlineRegular, IconStopFillRegular, StateDot, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { JobId } from '@deepseek-ai/dsh-jobs/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkbenchCommand } from './commands.ts'
import { DashboardCards } from './DashboardCards.tsx'
import type { DashboardSessionSummary, GoalRowContext, JobRowContext, TokenRowContext } from './DashboardCards.tsx'
import { Card, compact } from './WorkbenchPanel.tsx'
import type { OngoingRow, RemindersSnapshot, TodayRow } from './WorkbenchPanel.tsx'
import type { WorkbenchKey } from './locales.ts'
import css from './WorkbenchPanel.module.css'

/** Props for the 指挥台 tab. */
export interface CommandTabProps {
  t(key: WorkbenchKey): string
  phase: string
  sessions: {
    readonly ids: readonly SessionId[]
    readonly byId: Readonly<Record<SessionId, DashboardSessionSummary | undefined>>
    readonly phase: string
  }
  ongoingRows: readonly OngoingRow[]
  todayRows: readonly TodayRow[]
  jobRows: readonly JobRowContext[]
  workflowRows: readonly JobRowContext[]
  goalRows: readonly GoalRowContext[]
  reminders: RemindersSnapshot
  tokenRows: readonly TokenRowContext[]
  tokenTotals: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
  commands: readonly WorkbenchCommand[]
  onRunCommand(command: WorkbenchCommand): void
  /** Card row clicks open the lightweight right drawer for that Session. */
  onOpenSession(sessionId: SessionId): void
  onStopJob(sessionId: SessionId, jobId: JobId): void
  /** Composer seat surface (workspace picker + embedded native InputBar). */
  composer: ReactNode
  onOpenTrend(): void
}

const TODAY_TONE: Record<string, 'info' | 'warning' | 'danger' | 'neutral' | 'success'> = {
  info: 'info',
  warning: 'warning',
  danger: 'danger',
  neutral: 'neutral',
  success: 'success',
}

/**
 * Render the 指挥台 tab.
 * @param props - derived rows, commands, and the injected actions.
 * @returns the command dashboard.
 */
export function CommandTab(props: CommandTabProps) {
  const {
    t, sessions, ongoingRows, todayRows, jobRows, workflowRows, goalRows, reminders,
    tokenRows, tokenTotals, commands, onRunCommand, onOpenSession, onStopJob,
    composer, onOpenTrend,
  } = props

  const ctxValues = tokenRows.flatMap(row => row.percent === undefined ? [] : [row.percent])
  const ctxAvg = ctxValues.length === 0 ? 0 : Math.round(ctxValues.reduce((sum, v) => sum + v, 0) / ctxValues.length)

  return (
    <div className={css.tabView}>
      <div className={css.quickRow} aria-label={t('quick.aria')}>
        {commands.filter(command => command.common).map(command => {
          const Icon = command.icon
          return (
            <Button key={command.id} variant="outline" size="sm"
              aria-label={t(command.nameKey)}
              onClick={() => { onRunCommand(command) }}>
              <Icon size={14} />
              {t(command.nameKey)}
            </Button>
          )
        })}
      </div>

      <div className={css.summaryCols}>
        <Card icon={<StateDot state="ongoing" size={12} />} title={t('ongoing.title')} count={ongoingRows.length}>
          {ongoingRows.length === 0
            ? <p className={css.empty}>{t('ongoing.empty')}</p>
            : ongoingRows.slice(0, 8).map(row => (
                <div key={row.key} className={css.rowClickable} role="button" tabIndex={0}
                  onClick={() => { onOpenSession(row.sessionId) }}
                  onKeyDown={event => { if (event.key === 'Enter') onOpenSession(row.sessionId) }}>
                  <StateDot className={css.rowDot} state="ongoing" />
                  <div className={css.rowMain}>
                    <span className={css.rowTitle}>{row.title}</span>
                    <span className={css.rowMeta}>{row.meta}</span>
                  </div>
                  {row.kind === 'job' && row.jobId !== undefined && (
                    <div className={css.rowActions}>
                      <Button variant="ghost" size="sm" aria-label={t('ongoing.stop')}
                        onClick={event => { event.stopPropagation(); onStopJob(row.sessionId, row.jobId as JobId) }}
                        icon={<IconStopFillRegular size={13} />} />
                    </div>
                  )}
                </div>
              ))}
        </Card>

        <Card icon={<StateDot state="warning" size={12} />} title={t('reminders.today')} count={todayRows.length}>
          {todayRows.length === 0
            ? <p className={css.empty}>{t('reminders.empty')}</p>
            : todayRows.map(row => {
                const body = (
                  <>
                    <StateDot className={css.rowDot} state={row.kind === 'goal' && row.tone === 'danger' ? 'error' : row.kind === 'goal' ? 'ongoing' : 'warning'} />
                    <div className={css.rowMain}>
                      <span className={css.rowTitle}>{row.title}</span>
                      <span className={css.rowMeta}>{row.meta}</span>
                    </div>
                    <div className={css.rowSide}>
                      <Tag tone={TODAY_TONE[row.tone] ?? 'info'}>{row.tag}</Tag>
                    </div>
                  </>
                )
                return row.sessionId === undefined
                  ? <div key={row.key} className={css.rowClickable}>{body}</div>
                  : (
                      <div key={row.key} className={css.rowClickable} role="button" tabIndex={0}
                        onClick={() => { onOpenSession(row.sessionId as SessionId) }}
                        onKeyDown={event => { if (event.key === 'Enter') onOpenSession(row.sessionId as SessionId) }}>
                        {body}
                      </div>
                    )
              })}
        </Card>
      </div>

      <DashboardCards
        t={t}
        sessions={sessions}
        jobRows={jobRows}
        workflowRows={workflowRows}
        goalRows={goalRows}
        reminders={reminders}
        tokenRows={tokenRows}
        tokenTotals={tokenTotals}
        onOpenSession={onOpenSession}
        onStopJob={onStopJob}
      />

      <div className={css.strip}>
        <div className={css.stripNums}>
          <span>{t('strip.input')} <b>{compact(tokenTotals.input)}</b></span>
          <span>{t('strip.output')} <b>{compact(tokenTotals.output)}</b></span>
          <span>{t('strip.context')} <b>{ctxAvg}%</b></span>
        </div>
        <Button variant="ghost" size="sm" onClick={onOpenTrend}
          icon={<IconRightUpOutlineRegular size={13} />}>
          {t('strip.trend')}
        </Button>
      </div>

      {composer}
    </div>
  )
}
