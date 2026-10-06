/**
 * Cross-session workbench body: 指挥台 (command dashboard with a command
 * palette, quick actions, clickable cards, and a floating composer) plus
 * 监控 (resource trends, a realtime activity stream, and progress). Client
 * aggregates live in one module-level store (see store.ts) so both tabs share
 * one subscription each, per the design's §6 state model.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import {
  Button, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular, IconCloseOutlineRegular,
  IconMicrophoneOutlineRegular, IconRightUpOutlineRegular, IconSearchOutlineRegular, SegmentedTabs,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, SessionProviderComponent } from '@deepseek-ai/dsh-client-ui-slots'
import type { } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { } from '@deepseek-ai/dsh-client-ui-session/client'
import type { JobsSnapshot } from '@deepseek-ai/dsh-api-job-controller/client'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { DirectoryListing } from '@deepseek-ai/dsh-api-remotes/client'
import type { JobId } from '@deepseek-ai/dsh-jobs/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule/client'
import type { } from '@deepseek-ai/dsh-goal/client'
import type { } from '@deepseek-ai/dsh-token-meter/client'
import type { } from '@deepseek-ai/dsh-subagent/client'
import { createWorkbenchCommands } from './commands.ts'
import type { CommandDeps, WorkbenchCommand } from './commands.ts'
import { getWorkbenchStore } from './store.ts'
import type { ActivityFeedState, ActivityStore, FeedJobRow, FeedSessionRow, TrendSampler } from './store.ts'
import { diffActivityFeed } from './store.ts'
import type { EmbedMode } from './ConversationEmbed.tsx'
import { CommandPalette } from './CommandPalette.tsx'
import { CommandTab } from './CommandTab.tsx'
import { MonitorTab } from './MonitorTab.tsx'
import { WorkspaceDirectoryDialog } from './WorkspaceDirectoryDialog.tsx'
import { NS, type WorkbenchKey } from './locales.ts'
import css from './WorkbenchPanel.module.css'

/** Read-only host reminder catalog snapshot. */
export interface RemindersSnapshot {
  records: readonly ScheduleCatalogEntry[]
  status: 'loading' | 'ready' | 'error'
}

/**
 * Outcome of one "new workspace" request (design §11.5).
 * - workspace: the picked/created path was adopted as a real Workspace.
 * - browse:    the host has no native OS chooser (browse-only picker); the
 *              panel drives the in-app directory browser starting at `home`.
 * - cancelled: the operator dismissed the interaction.
 * - error:     neither interaction could be served.
 */
export type DirectoryPickOutcome =
  | { kind: 'workspace'; workspaceId: WorkspaceId }
  | { kind: 'browse'; home: DirectoryListing }
  | { kind: 'cancelled' }
  | { kind: 'error' }

/** How the composer answered one command prime request (drives the toast). */
export type PrimeOutcome = 'primed' | 'rebinding' | 'need-workspace'

/** Activity source exposed as a hook: the store already is snapshot/subscribe shaped. */
export type ActivitySource = Pick<ActivityStore, 'getSnapshot' | 'subscribe'>

/** Registration-side business face for the workbench body. */
export interface WorkbenchInjected {
  hooks: {
    /** Client jobs snapshot (rosters) bound by the renderer as useJobs. */
    jobs: {
      getSnapshot(): JobsSnapshot
      subscribe(listener: () => void): () => void
    }
    /** Host reminder catalog bound by the renderer as useReminders. */
    reminders: HostObservable<RemindersSnapshot>
    /** Realtime activity stream bound as useActivity. */
    activity: ActivitySource
    /** Resource trend sampler bound as useTrends. */
    trends: TrendSampler
  }
  /** Click-to-execute capabilities, wired to uiWorkspace / jobs.kill in the browser entry. */
  actions: {
    openSession(sessionId: SessionId): void
    /**
     * Resolve (reuse or create) the blank Session of one Workspace and retain
     * it for the composer seat; navigation-free (design §11.5).
     */
    connectComposerWorkspace(workspaceId: WorkspaceId): Promise<SessionReference>
    /** Retain one catalogued Session for the drawer seat; undefined when unknown. */
    acquireDrawerSession(sessionId: SessionId): SessionReference | undefined
    /**
     * New-workspace directory picking: the host's native OS chooser when
     * available, otherwise the in-app browse starting point.
     */
    pickWorkspaceDirectory(): Promise<DirectoryPickOutcome>
    /** List one directory level for the in-app picker; undefined on failure. */
    browseWorkspaceDirectory(path?: string): Promise<DirectoryListing | undefined>
    /** Create one child directory in the in-app picker; undefined on failure. */
    createWorkspaceDirectory(path: string, name: string): Promise<string | undefined>
    /** Adopt an absolute host path as a Workspace; undefined on failure. */
    adoptWorkspacePath(path: string): Promise<WorkspaceId | undefined>
    /**
     * Replace the composer Session's draft with a command template (or clear
     * it) and focus the native InputBar, without navigating away.
     */
    primeComposerDraft(sessionId: SessionId, prompt?: string): boolean
    stopJob(sessionId: SessionId, jobId: JobId): Promise<boolean>
  }
}

/**
 * Runtime scope seat the renderer adds to the panel kit because its `main`
 * registration declares session-scope children (design §11). `SlotMap['main']`
 * is root-scoped, so these seats are typed locally instead of PropsRenderSlots.
 */
interface ScopeSeat {
  SessionProvider: SessionProviderComponent
  renderSlot(key: 'workbench.composer.conversation' | 'workbench.drawer.conversation', owner: { readonly mode: EmbedMode }): ReactNode
}

/** Props for the workbench body: the framework global seat, the injected sources and actions, the panel's locale, and the children seats. */
export type WorkbenchPanelProps = PropsRuntime<'main'> & InjectFace<WorkbenchInjected> & PropsLocale<typeof NS> & ScopeSeat

/** Sentinel select value that triggers the host-native new-workspace flow. */
const NEW_WORKSPACE_VALUE = '__workbench-new-workspace__'

/** Drawer width bounds and its localStorage key (design §11.2). */
const DRAWER_MIN = 360
const DRAWER_MAX = 720
const DRAWER_WIDTH_KEY = 'dsh-workbench.drawer-width'

function initialDrawerWidth(): number {
  if (typeof localStorage === 'undefined') return 480
  const raw = Number(localStorage.getItem(DRAWER_WIDTH_KEY))
  return Number.isFinite(raw) && raw >= DRAWER_MIN && raw <= DRAWER_MAX ? raw : 480
}

/** Composer workspace pick cache key: the pick survives page switches (design §11.5). */
const WORKSPACE_PICK_KEY = 'dsh-workbench.workspace-pick'

/** Cached pick from a previous visit; validated against the catalog once it is ready. */
function initialWorkspacePick(): WorkspaceId | undefined {
  if (typeof localStorage === 'undefined') return undefined
  const raw = localStorage.getItem(WORKSPACE_PICK_KEY)
  return raw === null || raw === '' ? undefined : (raw as WorkspaceId)
}

/** The two workbench tabs. */
export type WorkbenchTab = 'command' | 'monitor'

/** Rows shown per list card before the pager appears. */
export const PAGE_SIZE = 5
export const PAGE_SIZE_LARGE = 10

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

/** Join CSS-module class candidates, dropping falsy entries. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** Render a tabular count with locale separators. */
export function fmt(value: number): string {
  return value.toLocaleString()
}

/** Format an RFC 3339 instant as a local HH:mm label. */
export function hhmmOf(instant: string): string {
  const date = new Date(instant)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Compact million/thousand label for the resource strip. */
export function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`
  return String(value)
}

/** Page window over a list, kept clamped when the list shrinks. */
export interface Pagination<T> {
  current: number
  totalPages: number
  pageItems: readonly T[]
  setPage: (page: number) => void
}

/** Component-private page cursor: a fixed-size slice of a list, no subscription. */
export function usePagination<T>(items: readonly T[], pageSize: number): Pagination<T> {
  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(page, totalPages - 1)
  const start = current * pageSize
  return { current, totalPages, pageItems: items.slice(start, start + pageSize), setPage }
}

/** The pager footer: two chevron buttons flanking a tabular page indicator. */
export function Pager({ current, totalPages, prevLabel, nextLabel, onPrev, onNext }: {
  current: number
  totalPages: number
  prevLabel: string
  nextLabel: string
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <footer className={css.pager}>
      <Button variant="ghost" size="sm" aria-label={prevLabel} disabled={current === 0} onClick={onPrev}
        icon={<IconChevronLeftOutlineRegular size={14} />} />
      <span className={css.pagerLabel}>{current + 1} / {totalPages}</span>
      <Button variant="ghost" size="sm" aria-label={nextLabel} disabled={current >= totalPages - 1} onClick={onNext}
        icon={<IconChevronRightOutlineRegular size={14} />} />
    </footer>
  )
}

/** Build the pager footer for a page, or nothing when the list fits one page. */
export function pagerFooter<T>(page: Pagination<T>, prevLabel: string, nextLabel: string): ReactNode {
  if (page.totalPages <= 1) return undefined
  return (
    <Pager current={page.current} totalPages={page.totalPages} prevLabel={prevLabel} nextLabel={nextLabel}
      onPrev={() => page.setPage(page.current - 1)} onNext={() => page.setPage(page.current + 1)} />
  )
}

/** A card's shell: the settings-card material with a title, count, body, and optional pager. */
export function Card({ wide, icon, title, count, footer, children }: {
  wide?: boolean
  icon: ReactNode
  title: string
  count: number
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={cx(css.card, wide && css.cardWide)}>
      <header className={css.cardHeader}>
        <div className={css.cardTitleGroup}>
          {icon}
          <h2 className={css.cardTitle}>{title}</h2>
        </div>
        <span className={css.cardCount}>{count}</span>
      </header>
      <div className={css.cardBody}>{children}</div>
      {footer}
    </section>
  )
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

/**
 * Render the two-tab workbench and own the client aggregates' lifecycle.
 * @param props - framework session catalog, injected sources/actions, and localized copy.
 * @returns the workbench panel body.
 */
export function WorkbenchPanel(props: WorkbenchPanelProps) {
  const { useSessions, useJobs, useReminders, useActivity, useTrends, actions, t } = props
  const { SessionProvider, renderSlot } = props
  const sessionsState = useSessions(state => state)
  const jobsState = useJobs(state => state)
  const reminders = useReminders(state => state)
  const workspaces = props.useWorkspaces(state => state)
  const store = useMemo(() => getWorkbenchStore(), [])

  const [tab, setTab] = useState<WorkbenchTab>('command')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toast, setToast] = useState<{ seq: number; text: string; tone: 'success' | 'error' } | null>(null)
  const toastSeq = useRef(0)

  const notify = useCallback((text: string, tone: 'success' | 'error' = 'success') => {
    setToast({ seq: ++toastSeq.current, text, tone })
  }, [])

  /* ---- derived rows (kept from the read-only dashboard, now clickable) ---- */
  const { ids, byId, phase } = sessionsState
  const { rows: jobRowsBySession } = jobsState

  /* ---- workspace pick + composer seat binding (design §11.5) ----
     The pick is cached in localStorage so a page switch or reload restores
     the binding without a manual re-pick; once the workspace catalog is
     ready the cached id is validated and dropped if it no longer exists.
     Until a pick lands, the InputBar seat renders disabled-grey. */
  const [workspacePick, setWorkspacePickState] = useState<WorkspaceId | undefined>(initialWorkspacePick)
  const setWorkspacePick = useCallback((id: WorkspaceId | undefined): void => {
    if (typeof localStorage !== 'undefined') {
      if (id === undefined) localStorage.removeItem(WORKSPACE_PICK_KEY)
      else localStorage.setItem(WORKSPACE_PICK_KEY, id)
    }
    setWorkspacePickState(id)
  }, [])
  const effectiveWorkspaceId = workspacePick

  const composerHolder = useRef<{ wsId: WorkspaceId; ref: SessionReference } | null>(null)
  const pendingPrime = useRef<{ prompt?: string | undefined } | null>(null)
  // Bumping this state is what re-renders the seat when the async bind lands;
  // without it the InputBar would only appear on the next unrelated render.
  const [, setComposerReady] = useState(0)
  const [rebindSeq, setRebindSeq] = useState(0)
  const releaseComposer = useCallback(() => {
    composerHolder.current?.ref.release()
    composerHolder.current = null
  }, [])

  useEffect(() => {
    // Gate on the workspace catalog: a cached pick restores before the
    // catalog finishes loading, and connectWorkspace rejects for an id the
    // host has not seen yet — without this gate the silent catch below
    // leaves the seat greyed forever (nothing re-triggers the effect).
    if (workspaces.phase !== 'ready'
      || workspacePick === undefined
      || !workspaces.items.some(w => w.workspaceId === workspacePick)) {
      releaseComposer()
      setComposerReady(n => n + 1)
      return
    }
    let cancelled = false
    actions.connectComposerWorkspace(workspacePick).then(ref => {
      if (cancelled) {
        ref.release()
        return
      }
      releaseComposer()
      composerHolder.current = { wsId: workspacePick, ref }
      const prime = pendingPrime.current
      pendingPrime.current = null
      setComposerReady(n => n + 1)
      // A command asked for a fresh composer session while rebinding: prime
      // its template now that the new blank Session exists.
      if (prime !== null) actions.primeComposerDraft(ref.sessionId, prime.prompt)
    }).catch(() => {
      setComposerReady(n => n + 1)
      // keep the previous binding until the next pick lands
    })
    return () => { cancelled = true }
  }, [workspacePick, workspaces.phase, workspaces.items, actions, releaseComposer, rebindSeq])

  useEffect(() => () => { releaseComposer() }, [releaseComposer])

  // Drop a cached/stale pick whose workspace vanished from the catalog;
  // until the catalog is ready the cached id is given the benefit of doubt.
  useEffect(() => {
    if (workspaces.phase !== 'ready') return
    if (workspacePick !== undefined && !workspaces.items.some(w => w.workspaceId === workspacePick)) {
      setWorkspacePick(undefined)
    }
  }, [workspaces.phase, workspaces.items, workspacePick, setWorkspacePick])

  /**
   * Workbench-local target behind the command registry's startSession dep:
   * inject the command template into the composer Session's draft and focus
   * the native InputBar instead of navigating anywhere (design §11.5). Owns
   * every toast so the caller never reports a session the user cannot see.
   */
  const primeComposer = useCallback((prompt?: string): PrimeOutcome => {
    if (effectiveWorkspaceId === undefined) {
      notify(t('toast.pickWorkspaceFirst'), 'error')
      return 'need-workspace'
    }
    const holder = composerHolder.current
    const sid = holder?.ref.sessionId
    const blank = sid === undefined ? undefined : byId[sid]?.blank
    if (holder === null || sid === undefined || blank === undefined || !blank) {
      // Either the binding is still in flight (workspace picked moments ago)
      // or 新会话 with an already-used composer Session: queue the template
      // and rebind a fresh blank Session; the bind effect primes the draft.
      pendingPrime.current = { prompt }
      releaseComposer()
      setRebindSeq(n => n + 1)
      notify(prompt === undefined ? t('toast.composerReady') : t('toast.draftPrimed'), 'success')
      return 'rebinding'
    }
    actions.primeComposerDraft(sid, prompt)
    notify(prompt === undefined ? t('toast.composerReady') : t('toast.draftPrimed'), 'success')
    return 'primed'
  }, [actions, byId, effectiveWorkspaceId, notify, releaseComposer, t])

  /* ---- workspace add flow: native chooser, else in-app directory browser ---- */
  const [browseOpen, setBrowseOpen] = useState(false)
  const [browseListing, setBrowseListing] = useState<DirectoryListing | null>(null)
  const [browseBusy, setBrowseBusy] = useState(false)

  const finishAdopt = useCallback((id: WorkspaceId | undefined, closeBrowse: boolean): void => {
    if (id === undefined) {
      notify(t('toast.workspacePickFailed'), 'error')
      return
    }
    if (closeBrowse) {
      setBrowseOpen(false)
      setBrowseListing(null)
    }
    setWorkspacePick(id)
    notify(t('toast.workspaceCreated'), 'success')
  }, [notify, setWorkspacePick, t])

  const startAddWorkspace = useCallback((): void => {
    void actions.pickWorkspaceDirectory().then(outcome => {
      if (outcome.kind === 'workspace') finishAdopt(outcome.workspaceId, false)
      else if (outcome.kind === 'browse') {
        setBrowseListing(outcome.home)
        setBrowseOpen(true)
      } else if (outcome.kind === 'error') {
        notify(t('toast.workspacePickFailed'), 'error')
      }
      // cancelled: the controlled select snaps back to the current pick.
    })
  }, [actions, finishAdopt, notify, t])

  const browseEnter = useCallback(async (path: string): Promise<void> => {
    setBrowseBusy(true)
    const next = await actions.browseWorkspaceDirectory(path)
    setBrowseBusy(false)
    if (next === undefined) notify(t('toast.workspacePickFailed'), 'error')
    else setBrowseListing(next)
  }, [actions, notify, t])

  const browseNewFolder = useCallback(async (name: string): Promise<void> => {
    const listing = browseListing
    if (listing === null || name.trim() === '') return
    setBrowseBusy(true)
    const created = await actions.createWorkspaceDirectory(listing.path, name.trim())
    setBrowseBusy(false)
    if (created === undefined) {
      notify(t('toast.workspacePickFailed'), 'error')
      return
    }
    await browseEnter(created)
  }, [actions, browseEnter, browseListing, notify, t])

  const browseAdopt = useCallback(async (): Promise<void> => {
    const listing = browseListing
    if (listing === null) return
    setBrowseBusy(true)
    const id = await actions.adoptWorkspacePath(listing.path)
    setBrowseBusy(false)
    finishAdopt(id, true)
  }, [actions, browseListing, finishAdopt])

  const onWorkspaceChange = (event: { target: { value: string } }): void => {
    const value = event.target.value
    if (value === NEW_WORKSPACE_VALUE) {
      startAddWorkspace()
      return
    }
    setWorkspacePick(value as WorkspaceId)
  }

  /* ---- right drawer (design §11.2) ---- */
  const drawerHolder = useRef<SessionReference | null>(null)
  const [drawerSessionId, setDrawerSessionId] = useState<SessionId | null>(null)
  const [drawerWidth, setDrawerWidth] = useState(initialDrawerWidth)

  const closeDrawer = useCallback(() => {
    drawerHolder.current?.release()
    drawerHolder.current = null
    setDrawerSessionId(null)
  }, [])
  const openDrawer = useCallback((sessionId: SessionId) => {
    if (drawerHolder.current?.sessionId === sessionId) return
    const ref = actions.acquireDrawerSession(sessionId)
    if (ref === undefined) {
      notify(t('drawer.unavailable'), 'error')
      return
    }
    drawerHolder.current?.release()
    drawerHolder.current = ref
    setDrawerSessionId(ref.sessionId)
  }, [actions, notify, t])

  useEffect(() => () => { drawerHolder.current?.release() }, [])

  useEffect(() => {
    if (drawerSessionId === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [drawerSessionId, closeDrawer])

  const startResizing = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = drawerWidth
    const onMove = (move: PointerEvent): void => {
      const next = Math.min(DRAWER_MAX, Math.max(DRAWER_MIN, startWidth + (startX - move.clientX)))
      setDrawerWidth(next)
    }
    const onUp = (): void => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      setDrawerWidth(width => {
        if (typeof localStorage !== 'undefined') localStorage.setItem(DRAWER_WIDTH_KEY, String(width))
        return width
      })
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [drawerWidth])

  // First turn in the composer seat slides the drawer open with that Session.
  const composerSessionId = composerHolder.current?.ref.sessionId
  const composerBlank = useSessions(state =>
    composerSessionId === undefined ? undefined : state.byId[composerSessionId]?.blank)
  const autoOpenedFor = useRef<SessionId | undefined>(undefined)
  useEffect(() => {
    if (composerBlank !== false || drawerSessionId !== null) return
    const sid = composerHolder.current?.ref.sessionId
    if (sid === undefined || autoOpenedFor.current === sid) return
    autoOpenedFor.current = sid
    openDrawer(sid)
  }, [composerBlank, drawerSessionId, openDrawer])

  const sessionRows = useMemo(() => ids.flatMap(id => {
    const summary = byId[id]
    return summary === undefined || summary.blank ? [] : [summary]
  }), [ids, byId])

  const jobRows = useMemo(() => Object.entries(jobRowsBySession).flatMap(([sessionId, jobs]) => {
    const sessionTitle = byId[sessionId as SessionId]?.displayTitle ?? sessionId
    return (jobs ?? []).map(job => ({ job, sessionTitle, sessionId: sessionId as SessionId }))
  }), [jobRowsBySession, byId])

  const workflowRows = useMemo(() => jobRows.filter(({ job }) => job.kind === 'workflow'), [jobRows])

  const goalRows = useMemo(() => ids.flatMap(id => {
    const summary = byId[id]
    const projection = summary?.projectionValues?.goal
    if (summary === undefined || projection == null) return []
    return [{
      id,
      title: summary.displayTitle,
      objective: projection.goal.objective,
      goalPhase: projection.goal.phase,
      rounds: projection.roundsStarted,
    }]
  }), [ids, byId])

  const tokenRows = useMemo(() => ids.flatMap(id => {
    const summary = byId[id]
    if (summary === undefined) return []
    const usage = summary.projectionValues?.tokenUsage
    const pressure = summary.projectionValues?.contextPressure
    if (usage === undefined && pressure === undefined) return []
    const total = usage === undefined
      ? undefined
      : usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
    const used = pressure === undefined ? undefined : (pressure.projectedTokens ?? pressure.pressureTokens)
    const window = pressure?.contextWindow
    const percent = used === undefined || window === undefined
      ? undefined
      : Math.min(100, Math.round(used / window * 100))
    return [{ id, title: summary.displayTitle, total, percent, running: summary.running }]
  }), [ids, byId])

  const tokenTotals = useMemo(() => {
    let input = 0
    let output = 0
    let cacheRead = 0
    let cacheWrite = 0
    for (const id of ids) {
      const usage = byId[id]?.projectionValues?.tokenUsage
      if (usage === undefined) continue
      input += usage.uncachedInputTokens
      output += usage.outputTokens
      cacheRead += usage.cacheReadTokens
      cacheWrite += usage.cacheWriteTokens
    }
    return { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite }
  }, [ids, byId])

  /* ---- 进行中 / 今日提醒 summary rows ---- */
  const ongoingRows = useMemo<OngoingRow[]>(() => {
    const sessionsPart: OngoingRow[] = sessionRows
      .filter(summary => summary.running)
      .map(summary => ({
        key: `session/${summary.id}`,
        kind: 'session',
        title: summary.displayTitle,
        meta: t('sessions.running'),
        running: true,
        sessionId: summary.id,
      }))
    const jobsPart: OngoingRow[] = jobRows
      .filter(({ job }) => job.status === 'running' || job.status === 'stopping')
      .map(({ job, sessionTitle, sessionId }) => ({
        key: `job/${job.id}`,
        kind: 'job',
        title: job.label,
        meta: `${sessionTitle} · ${job.progress ?? t('jobs.running')}`,
        running: true,
        sessionId,
        jobId: job.id,
      }))
    return [...sessionsPart, ...jobsPart]
  }, [sessionRows, jobRows, t])

  const todayRows = useMemo<TodayRow[]>(() => {
    const reminderPart: TodayRow[] = reminders.records
      .filter(record => record.status === 'active')
      .slice(0, 5)
      .map(record => ({
        key: `reminder/${String(record.id)}`,
        kind: 'reminder',
        title: record.title,
        meta: hhmmOf(record.scheduledAt),
        tone: 'info',
        tag: t('reminders.active'),
        sessionId: record.sessionId,
      }))
    const goalPart: TodayRow[] = goalRows
      .filter(row => row.goalPhase === 'active' || row.goalPhase === 'blocked')
      .map(row => ({
        key: `goal/${row.id}`,
        kind: 'goal',
        title: row.objective,
        meta: `${row.title} · ${row.rounds}`,
        tone: GOAL_PHASE_TONE[row.goalPhase] ?? 'neutral',
        tag: t(GOAL_PHASE_KEY[row.goalPhase] ?? 'goals.phase.active'),
        sessionId: row.id,
      }))
    return [...reminderPart, ...goalPart]
  }, [reminders.records, goalRows, t])

  /* ---- activity feed + trend sampling (design §6: one shared store) ---- */
  const feedPrev = useRef<ActivityFeedState | undefined>(undefined)
  useEffect(() => {
    const feedState: ActivityFeedState = {
      sessions: {
        ids,
        byId: Object.fromEntries(ids.flatMap(id => {
          const summary = byId[id]
          return summary === undefined ? [] : [[id, summary]] as const
        })) as Record<string, FeedSessionRow>,
      },
      jobs: { rows: jobRowsBySession as Record<string, readonly FeedJobRow[] | undefined> },
    }
    const labels = {
      sessionCreated: (title: string) => `${t('events.sessionCreated')} · ${title}`,
      sessionStarted: (title: string) => `${t('events.sessionStarted')} · ${title}`,
      sessionFinished: (title: string) => `${t('events.sessionFinished')} · ${title}`,
      jobStarted: (label: string) => `${t('events.jobStarted')} · ${label}`,
      jobProgress: (label: string, progress: string) => `${t('events.jobProgress')} · ${label} · ${progress}`,
      jobFinished: (label: string) => `${t('events.jobFinished')} · ${label}`,
      jobFailed: (label: string) => `${t('events.jobFailed')} · ${label}`,
      jobStopped: (label: string) => `${t('events.jobStopped')} · ${label}`,
    }
    diffActivityFeed(store.activity, feedPrev.current, feedState, labels)
    feedPrev.current = feedState

    const runningJobs = jobRows.filter(({ job }) => job.status === 'running' || job.status === 'stopping').length
    const ctxValues = tokenRows.flatMap(row => row.percent === undefined ? [] : [row.percent])
    store.trends.feed({
      input: tokenTotals.input + tokenTotals.cacheRead + tokenTotals.cacheWrite,
      output: tokenTotals.output,
      ctx: ctxValues.length === 0 ? 0 : Math.round(ctxValues.reduce((sum, v) => sum + v, 0) / ctxValues.length),
      jobs: runningJobs,
    })
  })

  useEffect(() => {
    store.trends.start()
    return () => { store.trends.stop() }
  }, [store])

  /* ---- keyboard: Ctrl/⌘+K toggles the palette from either tab ---- */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(open => !open)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [])

  /* ---- command registry (design §5: palette + quick actions share one list) ---- */
  const latest = useRef({ sessionRows, jobRows, ongoingRows })
  latest.current = { sessionRows, jobRows, ongoingRows }

  const commandDeps = useMemo<CommandDeps>(() => ({
    t,
    sessionOptions: () => latest.current.sessionRows.map(summary => ({ id: String(summary.id), label: summary.displayTitle })),
    runningJobOptions: () => latest.current.jobRows
      .filter(({ job }) => job.status === 'running' || job.status === 'stopping')
      .map(({ job, sessionTitle, sessionId }) => ({ id: String(job.id), sessionId, label: `${job.label} · ${sessionTitle}` })),
    openSession: sessionId => { actions.openSession(sessionId) },
    /** Command templates land in the workbench composer, not a new main-view session. */
    startSession: prompt => { primeComposer(prompt) },
    stopJob: (sessionId, jobId) => actions.stopJob(sessionId, jobId as JobId),
    switchTab: setTab,
    summaryText: () => {
      const runningSessions = latest.current.sessionRows.filter(row => row.running).length
      const runningJobs = latest.current.ongoingRows.filter(row => row.kind === 'job').length
      const ctxValues = tokenRows.flatMap(row => row.percent === undefined ? [] : [row.percent])
      const ctx = ctxValues.length === 0 ? 0 : Math.round(ctxValues.reduce((sum, v) => sum + v, 0) / ctxValues.length)
      return t('summary.fmt')
        .replace('{sessions}', String(runningSessions))
        .replace('{jobs}', String(runningJobs))
        .replace('{reminders}', String(reminders.records.filter(record => record.status === 'active').length))
        .replace('{ctx}', String(ctx))
    },
    notify,
  }), [actions, t, notify, tokenRows, reminders.records, primeComposer])

  const commands = useMemo<WorkbenchCommand[]>(() => createWorkbenchCommands(commandDeps), [commandDeps])

  const runCommand = useCallback((command: WorkbenchCommand) => {
    if (command.param !== undefined) return
    store.mru.add(command.id)
    void command.run()
  }, [store])

  const paletteRun = useCallback((command: WorkbenchCommand, target?: { id: string; label: string }) => {
    store.mru.add(command.id)
    void command.run(target)
  }, [store])

  /* ---- composer seat surface (design §11.5: native InputBar under the cards) ---- */
  const composerSeat = composerHolder.current
  // The workspace selector lives in the header's top-right (v4); the composer
  // area keeps only the native InputBar (or the pick-a-workspace hint).
  const workspaceSelect = (
    <select
      className={css.workspaceSelect}
      value={effectiveWorkspaceId ?? ''}
      onChange={onWorkspaceChange}
      aria-label={t('composer.workspace')}
    >
      {workspaces.phase !== 'ready' && (
        <option value="">{t('composer.workspaceLoading')}</option>
      )}
      {workspaces.phase === 'ready' && effectiveWorkspaceId === undefined && (
        <option value="">{t('composer.workspacePlaceholder')}</option>
      )}
      {workspaces.items.map(workspace => (
        <option key={workspace.workspaceId} value={workspace.workspaceId}>
          {workspace.title === '' ? workspace.path : `${workspace.title} · ${workspace.path}`}
        </option>
      ))}
      <option value={NEW_WORKSPACE_VALUE}>{t('composer.newWorkspace')}</option>
    </select>
  )
  const composerArea = (
    <div className={css.composerArea}>
      {composerSeat !== null && composerSeat.wsId === effectiveWorkspaceId
        ? (
          <div className={css.composerSeat}>
            <SessionProvider session={composerSeat.ref}>
              {renderSlot('workbench.composer.conversation', { mode: 'composer' })}
            </SessionProvider>
          </div>
        )
        : (
          /* Seat placeholder: always visible, greyed out until a workspace
             pick binds a blank Session into it. */
          <div className={css.composerDisabled} aria-disabled="true">
            <p className={css.workspaceHint}>
              {workspaces.phase === 'ready' ? t('composer.workspaceHint') : t('composer.workspaceLoading')}
            </p>
          </div>
        )}
    </div>
  )

  const drawerTitle = drawerSessionId === null ? '' : byId[drawerSessionId]?.displayTitle ?? ''

  return (
    <section className={css.page} aria-label={t('title')}>
      <div className={css.pageScroll}>
        <div className={css.pageContent}>
          <div className={css.pageHeading}>
            <h1>{t('title')}</h1>
            <p className={css.pageSubtitle}>{t('subtitle')}</p>
          </div>
          <header className={css.workbenchTop}>
            <SegmentedTabs<WorkbenchTab>
              label={t('tabs.label')}
              items={[
                { value: 'command', label: t('tabs.command'), id: 'wb-tab', panelId: 'wb-panel-command' },
                { value: 'monitor', label: t('tabs.monitor'), id: 'wb-tab', panelId: 'wb-panel-monitor' },
              ]}
              value={tab}
              onChange={setTab}
            />
            <div className={css.workbenchTopRight}>
              <label className={css.topWorkspace}>
                <span className={css.workspaceLabel}>{t('composer.workspace')}</span>
                {workspaceSelect}
              </label>
              <Button variant="ghost" size="sm" aria-label={t('top.palette')} aria-pressed={paletteOpen}
                onClick={() => { setPaletteOpen(open => !open) }}
                icon={<IconSearchOutlineRegular size={16} />} />
              <Button variant="ghost" size="sm" aria-label={t('top.voice')}
                onClick={() => { notify(t('toast.voiceP2'), 'success') }}
                icon={<IconMicrophoneOutlineRegular size={16} />} />
            </div>
          </header>

          {paletteOpen && (
            <CommandPalette
              commands={commands}
              mruIds={store.mru.ids}
              t={t}
              onRun={paletteRun}
              onClose={() => { setPaletteOpen(false) }}
            />
          )}

          {tab === 'command'
            ? (
              <CommandTab
                t={t}
                phase={phase}
                sessions={{ ids, byId, phase }}
                jobRows={jobRows}
                workflowRows={workflowRows}
                goalRows={goalRows}
                reminders={reminders}
                tokenRows={tokenRows}
                tokenTotals={tokenTotals}
                ongoingRows={ongoingRows}
                todayRows={todayRows}
                commands={commands}
                onRunCommand={runCommand}
                onOpenSession={sessionId => { openDrawer(sessionId) }}
                onStopJob={(sessionId, jobId) => {
                  void actions.stopJob(sessionId, jobId).then(ok => {
                    notify(ok ? t('cmd.done.stopJob') : t('cmd.failed.stopJob'), ok ? 'success' : 'error')
                  })
                }}
                composer={composerArea}
                onOpenTrend={() => { setTab('monitor') }}
              />
            )
            : (
              <MonitorTab
                t={t}
                useActivity={useActivity}
                useTrends={useTrends}
                trendsSampler={store.trends}
                workflowRows={workflowRows}
                goalRows={goalRows}
                tokenRows={tokenRows}
              />
            )}

          <Fragment>
            {toast !== null && (
              <div key={toast.seq} className={cx(css.toast, toast.tone === 'error' && css.toastError)} role="status">
                {toast.text}
              </div>
            )}
          </Fragment>

          <WorkspaceDirectoryDialog
            t={t}
            open={browseOpen}
            listing={browseListing}
            busy={browseBusy}
            onEnter={browseEnter}
            onNewFolder={browseNewFolder}
            onAdopt={browseAdopt}
            onClose={() => { setBrowseOpen(false); setBrowseListing(null) }}
          />
        </div>
      </div>

      {drawerSessionId !== null && drawerHolder.current !== null && (
        <div className={css.drawerOverlay} onClick={closeDrawer}>
          <aside
            className={css.drawer}
            style={{ width: drawerWidth }}
            role="dialog"
            aria-label={drawerTitle}
            onClick={event => { event.stopPropagation() }}
          >
            <div className={css.drawerResizer} onPointerDown={startResizing} />
            <header className={css.drawerHead}>
              <h2 className={css.drawerTitle}>{drawerTitle}</h2>
              <Button variant="ghost" size="sm" aria-label={t('drawer.openMain')}
                onClick={() => { actions.openSession(drawerSessionId) }}
                icon={<IconRightUpOutlineRegular size={14} />} />
              <Button variant="ghost" size="sm" aria-label={t('drawer.close')}
                onClick={closeDrawer}
                icon={<IconCloseOutlineRegular size={14} />} />
            </header>
            <div className={css.drawerBody}>
              <SessionProvider session={drawerHolder.current}>
                {renderSlot('workbench.drawer.conversation', { mode: 'drawer' })}
              </SessionProvider>
            </div>
          </aside>
        </div>
      )}
    </section>
  )
}
