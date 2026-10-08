/**
 * 指挥台 (design v2): the 指挥舱 (command deck) — the quick actions as the
 * page's first surface — the 实时脊线 (live spine), a hairline-bounded
 * activity band with the newest events inline, then the section eyebrows
 * (正在发生 / 参考数据) that replace the old equal-weight card stack, the
 * eight clickable data-source cards, and the resource strip. Conversation
 * lives in the panel's right drawer; this tab has no input surface.
 */

import { useState } from 'react'
import {
  Button, IconRightUpOutlineRegular, IconStopFillRegular, StateDot, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { JobId } from '@deepseek-ai/dsh-jobs/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkbenchCommand } from './commands.ts'
import { compact } from '../shared/format.ts'
import { Card, pagerFooter, usePagination, PAGE_SIZE_LARGE } from '../shared/presentation.tsx'
import type { DashboardSessionSummary, GoalRowContext, JobRowContext, OngoingRow, RemindersSnapshot, TodayRow, TokenRowContext } from '../shared/rows.ts'
import type { ActivitySnapshot } from '../activity/store.ts'
import type { WorkbenchKey } from '../locales.ts'
import css from '../WorkbenchPanel.module.css'

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
  onOpenJob(sessionId: SessionId, jobId: JobId): void
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
    t, sessions, useActivity, ongoingRows, todayRows, jobRows, goalRows,
    tokenRows, tokenTotals, commands, onRunCommand, onOpenSession, onStopJob, onOpenJob,
    onOpenTrend,
  } = props

  const [query, setQuery] = useState('')
  const [pins, setPins] = useState<readonly string[]>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem('dsh-workbench.pins') ?? '[]')
      return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []
    } catch (error) {
      // Storage may be unavailable or contain an interrupted write.
      return []
    }
  })
  const togglePin = (id: SessionId): void => {
    const next = pins.includes(id) ? pins.filter(value => value !== id) : [...pins, id]
    setPins(next)
    try { localStorage.setItem('dsh-workbench.pins', JSON.stringify(next)) } catch (error) {
      // Pinning remains usable in memory when storage is unavailable.
    }
  }
  const matches = (text: string): boolean => text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  const continuing = sessions.ids.flatMap(id => {
    const row = sessions.byId[id]
    return row === undefined || row.blank || !matches(row.displayTitle) ? [] : [{ ...row, id }]
  }).sort((a, b) => Number(pins.includes(b.id)) - Number(pins.includes(a.id)))
  const continuationPage = usePagination(continuing, PAGE_SIZE_LARGE)
  const visibleOngoing = ongoingRows.filter(row => matches(`${row.title} ${row.meta}`))
  const visibleToday = todayRows.filter(row => matches(`${row.title} ${row.meta}`))
  const failures = jobRows.filter(row => row.job.status === 'failed' && matches(row.job.label))
  const blocked = goalRows.filter(row => row.goalPhase === 'blocked' && matches(row.objective))
  const activity = useActivity(state => state)
  const spineEvents = activity.events.slice(0, SPINE_EVENTS)

  const ctxValues = tokenRows.flatMap(row => row.percent === undefined ? [] : [row.percent])
  const ctxAvg = ctxValues.length === 0 ? 0 : Math.round(ctxValues.reduce((sum, v) => sum + v, 0) / ctxValues.length)

  return (
    <div className={css.tabView}>
      {/* 指挥舱: quick actions as the page's first surface */}
      <div className={css.deck}>
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

      <input className={css.operationSearch} value={query} onChange={e => { setQuery(e.target.value) }} aria-label={t('op.search')} placeholder={t('op.search')} />
      <Card icon={<StateDot state="error" />} title={t('op.attention')} count={failures.length + blocked.length}>
        {failures.map(({ job, sessionId }) => <Button key={job.id} variant="ghost" onClick={() => { onOpenJob(sessionId, job.id) }}>{job.label}</Button>)}
        {blocked.map(row => <Button key={row.id} variant="ghost" onClick={() => { onOpenSession(row.id) }}>{row.objective}</Button>)}
        {failures.length + blocked.length === 0 && <p className={css.empty}>{t('ongoing.empty')}</p>}
      </Card>
      <Card icon={<StateDot state="ongoing" />} title={t('op.continue')} count={continuing.length} footer={pagerFooter(continuationPage, t('pager.prev'), t('pager.next'))}>
        {continuationPage.pageItems.map(row => <div key={row.id} className={css.rowClickable}>
          <Button variant="ghost" onClick={() => { onOpenSession(row.id) }}>{row.displayTitle}</Button>
          <Button variant="ghost" size="sm" aria-pressed={pins.includes(row.id)} onClick={() => { togglePin(row.id) }}>{t(pins.includes(row.id) ? 'op.unpin' : 'op.pin')}</Button>
        </div>)}
      </Card>
      {/* 正在发生: the attention pair */}
      <Eyebrow name={t('eyebrow.happening')} />
      <div className={css.summaryCols}>
        <Card icon={<StateDot state="ongoing" size={12} />} title={t('ongoing.title')} count={visibleOngoing.length}>
          {visibleOngoing.length === 0
            ? <p className={css.empty}>{t('ongoing.empty')}</p>
            : visibleOngoing.slice(0, 8).map(row => (
                <div key={row.key} className={css.rowClickable} role="button" tabIndex={0}
                  onClick={() => { row.jobId === undefined ? onOpenSession(row.sessionId) : onOpenJob(row.sessionId, row.jobId) }}
                  onKeyDown={event => { if (event.key === 'Enter') { row.jobId === undefined ? onOpenSession(row.sessionId) : onOpenJob(row.sessionId, row.jobId) } }}>
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

        <Card icon={<StateDot state="warning" size={12} />} title={t('reminders.today')} count={visibleToday.length}>
          {visibleToday.length === 0
            ? <p className={css.empty}>{t('reminders.empty')}</p>
            : visibleToday.map(row => {
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
