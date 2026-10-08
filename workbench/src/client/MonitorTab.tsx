/**
 * 监控 (design §4): resource-trend sparklines fed by the 30s sampler, the
 * realtime activity stream with pinned scrolling, and task/goal/context
 * progress bars. No chart library: inline SVG polylines over the design's
 * state-color tokens.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { GoalRowContext, JobRowContext, TokenRowContext } from './shared/rows.ts'
import type { ActivitySnapshot, TrendSampler, TrendSeries, TrendWindow } from './store.ts'
import { TREND_WINDOWS } from './store.ts'
import { cx } from './shared/format.ts'
import { Card } from './shared/presentation.tsx'
import type { WorkbenchKey } from './locales.ts'
import css from './WorkbenchPanel.module.css'

/** Props for the 监控 tab. */
export interface MonitorTabProps {
  t(key: WorkbenchKey): string
  useActivity: SnapshotSelectorHook<ActivitySnapshot>
  /** Re-render trigger for sampler updates; the series themselves come from the sampler. */
  useTrends: SnapshotSelectorHook<{ readonly last: unknown }>
  trendsSampler: TrendSampler
  workflowRows: readonly JobRowContext[]
  goalRows: readonly GoalRowContext[]
  tokenRows: readonly TokenRowContext[]
}

const SPARK_W = 300
const SPARK_H = 56

/** Stroke color token per metric, per the design's state-color rule. */
const METRICS = [
  { key: 'token', labelKey: 'trends.token', color: 'var(--dsw-alias-state-business-primary)', unit: '' },
  { key: 'ctx', labelKey: 'trends.ctx', color: 'var(--dsw-alias-state-warn-primary)', unit: '%' },
  { key: 'jobs', labelKey: 'trends.jobs', color: 'var(--dsw-alias-state-success-primary)', unit: '' },
] as const

type MetricKey = typeof METRICS[number]['key']

/** Build a viewBox-filling polyline point list for one numeric series. */
function sparkPoints(values: readonly number[]): string {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * SPARK_W
      const y = SPARK_H - 4 - ((value - min) / span) * (SPARK_H - 10)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

/** One sparkline block: label, tabular current value, and the SVG polyline. */
function Sparkline({ label, color, series, metric }: {
  label: string
  color: string
  series: TrendSeries
  metric: (typeof METRICS)[number]
}) {
  const values = metric.key === 'token' ? series.input : metric.key === 'ctx' ? series.ctx : series.jobs
  const points = sparkPoints(values)
  const last = values.length === 0 ? null : values[values.length - 1]
  return (
    <div className={css.trend}>
      <div className={css.trendHead}>
        <span className={css.trendLabel}>{label}</span>
        <span className={css.trendValue}>
          {last == null ? '—' : `${Math.round(last)}${metric.unit}`}
        </span>
      </div>
      <svg className={css.spark} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" aria-hidden="true">
        {points.length > 0 && (
          <>
            <polygon fill={color} fillOpacity="0.12" stroke="none"
              points={`0,${SPARK_H} ${points} ${SPARK_W},${SPARK_H}`} />
            <polyline fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke"
              strokeLinejoin="round" strokeLinecap="round" points={points} />
          </>
        )}
      </svg>
    </div>
  )
}

/** One activity-stream row. */
function StreamRow({ time, kind, text }: { time: string; kind: string; text: string }) {
  return (
    <div className={css.streamItem}>
      <span className={css.streamTime}>{time}</span>
      <StateDot className={css.rowDot} state={kind as 'done' | 'ongoing' | 'warning' | 'error' | 'idle'} />
      <span className={css.streamText}>{text}</span>
    </div>
  )
}

/**
 * Render the 监控 tab.
 * @param props - bound hooks, the sampler, and the progress row sources.
 * @returns the monitor surface.
 */
export function MonitorTab(props: MonitorTabProps) {
  const { t, useActivity, useTrends, trendsSampler, workflowRows, goalRows, tokenRows } = props
  const activity = useActivity(state => state)
  useTrends(state => state)
  const [window, setWindow] = useState<TrendWindow>('1h')

  const series = useMemo<TrendSeries>(
    () => trendsSampler.series(window),
    [trendsSampler, window, activity],
  )

  const seriesByMetric = useMemo<Record<MetricKey, TrendSeries>>(
    () => ({ token: series, ctx: series, jobs: series }),
    [series],
  )

  /* ---- activity stream: pinned-to-top follow with an unread chip ---- */
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const pinnedRef = useRef(true)
  const [pinned, setPinned] = useState(true)
  const [lastSeenTs, setLastSeenTs] = useState(0)

  const events = activity.events
  const unread = events.filter(event => event.ts > lastSeenTs).length

  useEffect(() => {
    const wrap = wrapRef.current
    if (wrap !== null && pinnedRef.current) wrap.scrollTop = 0
  }, [events])

  const onStreamScroll = (): void => {
    const wrap = wrapRef.current
    if (wrap === null) return
    const atTop = wrap.scrollTop <= 2
    pinnedRef.current = atTop
    setPinned(atTop)
    if (atTop) setLastSeenTs(events[0]?.ts ?? 0)
  }

  const jumpToTop = (): void => {
    const wrap = wrapRef.current
    if (wrap !== null) wrap.scrollTop = 0
    pinnedRef.current = true
    setPinned(true)
    setLastSeenTs(events[0]?.ts ?? 0)
  }

  useEffect(() => {
    // Mount: treat the initial batch as read.
    setLastSeenTs(events[0]?.ts ?? 0)
  }, [])

  /* ---- progress rows ---- */
  const progressRows = useMemo<ReactNode[]>(() => {
    const rows: ReactNode[] = []
    for (const { job } of workflowRows) {
      const percent = job.status === 'completed' ? 100 : undefined
      const width = percent ?? parsePercent(job.progress)
      rows.push(
        <div key={`wf-${job.id}`} className={css.progRow}>
          <span className={css.progLabel}>{job.label}</span>
          <span className={css.progVal}>{width === null ? '—' : `${width}%`}</span>
          <div className={css.progTrack}>
            {width !== null && <div className={css.progFill} style={{ width: `${width}%` }} />}
          </div>
        </div>,
      )
    }
    for (const goal of goalRows) {
      const blocked = goal.goalPhase === 'blocked'
      rows.push(
        <div key={`goal-${goal.id}`} className={css.progRow}>
          <span className={css.progLabel}>{goal.objective}</span>
          <span className={cx(css.progVal, blocked && css.progValWarn)}>{blocked ? t('goals.phase.blocked') : `${goal.rounds}`}</span>
          <div className={css.progTrack}>
            <div className={cx(css.progFill, blocked && css.progFillWarn)} style={{ width: blocked ? '30%' : '40%' }} />
          </div>
        </div>,
      )
    }
    for (const row of tokenRows.slice(0, 5)) {
      if (row.percent === undefined) continue
      rows.push(
        <div key={`ctx-${row.id}`} className={css.progRow}>
          <span className={css.progLabel}>{t('progress.context')} · {row.title}</span>
          <span className={css.progVal}>{row.percent}%</span>
          <div className={css.progTrack}>
            <div className={css.progFill} style={{ width: `${row.percent}%` }} />
          </div>
        </div>,
      )
    }
    return rows
  }, [workflowRows, goalRows, tokenRows, t])

  return (
    <div className={css.tabView}>
      <Card icon={<StateDot state="ongoing" size={12} />} title={t('trends.title')}
        headerExtra={(
          <div className={css.trendWindows} role="group" aria-label={t('trends.title')}>
            {TREND_WINDOWS.map(candidate => (
              <button key={candidate} type="button"
                aria-pressed={candidate === window}
                className={candidate === window ? cx(css.windowChip, css.windowChipActive) : css.windowChip}
                onClick={() => { setWindow(candidate) }}>
                {candidate}
              </button>
            ))}
          </div>
        )}>
        <div className={css.trends}>
          {METRICS.map(metric => (
            <Sparkline key={metric.key} label={t(metric.labelKey)} color={metric.color}
              series={seriesByMetric[metric.key]} metric={metric} />
          ))}
        </div>
      </Card>

      <div className={css.summaryCols}>
        <Card icon={<StateDot state={activity.status === 'live' ? 'ongoing' : 'warning'} size={12} />}
          title={t('stream.title')} count={events.length}>
          {activity.status !== 'live' && <p className={css.empty}>{t('stream.offline')}</p>}
          <div ref={wrapRef} className={css.streamWrap} onScroll={onStreamScroll}>
            {!pinned && unread > 0 && (
              <button type="button" className={css.streamNew} onClick={jumpToTop}>
                {unread} {t('stream.newEvents')}
              </button>
            )}
            <div className={css.stream}>
              {events.length === 0
                ? <p className={css.streamEmpty}>{t('stream.empty')}</p>
                : events.map(event => (
                    <StreamRow key={event.id} time={event.time} kind={event.kind} text={event.text} />
                  ))}
            </div>
          </div>
        </Card>

        <Card icon={<StateDot state="done" size={12} />} title={t('progress.title')} count={progressRows.length}>
          {progressRows.length === 0
            ? <p className={css.empty}>{t('progress.empty')}</p>
            : <div className={css.prog}>{progressRows}</div>}
        </Card>
      </div>
    </div>
  )
}

/** Parse a job progress string like "63%" into a number, or null when absent. */
function parsePercent(progress: string | undefined): number | null {
  if (progress === undefined) return null
  const match = /(\d+)/.exec(progress)
  return match === null ? null : Math.min(100, Number(match[1]))
}
