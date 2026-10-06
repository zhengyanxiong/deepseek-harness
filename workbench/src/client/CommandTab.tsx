/**
 * 指挥台 (design v2): the composer promoted into a 指挥舱 (command deck) at
 * the page's first surface with the quick actions docked inside it, the 实时
 * 脊线 (live spine) — a hairline-bounded activity band with the newest events
 * inline — then the section eyebrows (正在发生 / 参考数据) that replace the
 * old equal-weight card stack, the eight clickable data-source cards, and the
 * resource strip. The deck keeps the native InputBar seat supplied by the
 * panel as a ReactNode.
 */

import type { ReactNode } from 'react'
import {
  Button, IconRightUpOutlineRegular, IconStopFillRegular, StateDot, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { JobId } from '@deepseek-ai/dsh-jobs/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkbenchCommand } from './commands.ts'
import { DashboardCards } from './DashboardCards.tsx'
import type { DashboardSessionSummary, GoalRowContext, JobRowContext, TokenRowContext } from './DashboardCards.tsx'
import { Card, compact } from './WorkbenchPanel.tsx'
import type { OngoingRow, RemindersSnapshot, TodayRow } from './WorkbenchPanel.tsx'
import type { ActivitySnapshot } from './store.ts'
import type { WorkbenchKey } from './locales.ts'
import css from './WorkbenchPanel.module.css'

/** How many newest events the spine shows inline. */
const SPINE_EVENTS = 4

/** Props for the 指挥台 tab. */
export interface CommandTabProps {
  t(key: WorkbenchKey): string
  phase: string
  sessions: {
    readonly ids: readonly SessionId[]
    readonly byId: Readonly<Record<SessionId, DashboardSessionSummary | undefined>>
    readonly phase: string
  }
  /** Activity stream hook the spine reads the newest events from. */
  useActivity: SnapshotSelectorHook<ActivitySnapshot>
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

/** One section eyebrow: caption ink + a hairline rule filling the remainder. */
function Eyebrow({ name }: { name: string }) {
  return (
    <div className={css.eyebrow} aria-hidden="true">
      <span className={css.eyebrowName}>{name}</span>
      <span className={css.eyebrowRule} />
    </div>
  )
}

/**
 * Render the 指挥台 tab.
 * @param props - derived rows, commands, the activity hook, and the injected actions.
 * @returns the command dashboard.
 */
export function CommandTab(props: CommandTabProps) {
  const {
    t, sessions, useActivity, ongoingRows, todayRows, jobRows, workflowRows, goalRows, reminders,
    tokenRows, tokenTotals, commands, onRunCommand, onOpenSession, onStopJob,
    composer, onOpenTrend,
  } = props

  const activity = useActivity(state => state)
  const spineEvents = activity.events.slice(0, SPINE_EVENTS)

  const ctxValues = tokenRows.flatMap(row => row.percent === undefined ? [] : [row.percent])
  const ctxAvg = ctxValues.length === 0 ? 0 : Math.round(ctxValues.reduce((sum, v) => sum + v, 0) / ctxValues.length)

  return (
    <div className={css.tabView}>
      {/* 指挥舱: composer first, quick actions docked inside the deck */}
      <div className={css.deck} aria-label={t('title')}>
        {composer}
        <div className={css.deckActions} aria-label={t('quick.aria')}>
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
      </div>

      {/* 实时脊线: the live activity band */}
      <div className={css.spine} aria-label={t('spine.label')}>
        <div className={css.spineLive}>
          <span className={css.spinePulse} />
          {t('spine.label')}
        </div>
        <div className={css.spineEvents}>
          {spineEvents.length === 0
            ? <span className={css.spineEmpty}>{t('spine.empty')}</span>
            : spineEvents.map(event => (
                <span key={event.id} className={css.spineEvent}>
                  <span className={css.spineTime}>{event.time}</span>
                  <StateDot state={event.kind} />
                  <span className={css.spineText}>{event.text}</span>
                </span>
              ))}
        </div>
        <div className={css.spineMore}>
          <Button variant="ghost" size="sm" onClick={onOpenTrend}
            icon={<IconRightUpOutlineRegular size={13} />}>
            {t('spine.more')}
          </Button>
        </div>
      </div>

      {/* 正在发生: the attention pair */}
      <Eyebrow name={t('eyebrow.happening')} />
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

      {/* 参考数据: the eight data-source cards */}
      <Eyebrow name={t('eyebrow.reference')} />
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
    </div>
  )
}
