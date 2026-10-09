/**
 * Cross-session workbench body: 指挥台 (command dashboard with a command
 * palette, quick actions, and clickable cards) plus 监控 (resource trends, a
 * realtime activity stream, and progress). Client
 * aggregates live in one module-level store (see activity/store.ts) so both tabs share
 * one subscription each, per the design's §6 state model.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import {
  Button, IconChevronLeftOutlineRegular, IconCloseOutlineRegular,
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
import type { } from '@deepseek-ai/dsh-goal/client'
import type { } from '@deepseek-ai/dsh-token-meter/client'
import type { } from '@deepseek-ai/dsh-subagent/client'
import { createWorkbenchCommands } from './command/commands.ts'
import type { CommandDeps, WorkbenchCommand } from './command/commands.ts'
import { getWorkbenchStore } from './activity/store.ts'
import type { ActivityFeedState, ActivityStore, FeedJobRow, FeedSessionRow, TrendSampler } from './activity/store.ts'
import { diffActivityFeed } from './activity/store.ts'
import { CommandPalette } from './command/CommandPalette.tsx'
import { CommandTab } from './command/CommandTab.tsx'
import { DashboardCards } from './monitor/DashboardCards.tsx'
import { OperationForm } from './operations/OperationForm.tsx'
import { emptyOperationDraft } from './operations/operations.ts'
import type { OperationDraft, OperationKind } from './operations/operations.ts'
import { MonitorTab } from './monitor/MonitorTab.tsx'
import { WorkspaceDirectoryDialog } from './workspace/WorkspaceDirectoryDialog.tsx'
import { NS, type WorkbenchKey } from './locales.ts'
import { cx, hhmmOf } from './shared/format.ts'
import { GOAL_PHASE_KEY, GOAL_PHASE_TONE } from './shared/rows.ts'
import type { JobRowContext, OngoingRow, RemindersSnapshot, TodayRow } from './shared/rows.ts'
import css from './WorkbenchPanel.module.css'

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
     * it as an operation prepare target; navigation-free.
     */
    connectWorkspaceSession(workspaceId: WorkspaceId): Promise<SessionReference>
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
     * Prime a Session's request draft (without overwriting existing text or
     * attachments) and focus the embedded InputBar, without navigating away.
     */
    primeSessionDraft(sessionId: SessionId, prompt?: string): boolean
    stopJob(sessionId: SessionId, jobId: JobId): Promise<boolean>
  }
}

/**
 * Runtime scope seat the renderer adds to the panel kit because its `main`
 * registration declares a session-scope child. `SlotMap['main']` is
 * root-scoped, so these seats are typed locally instead of PropsRenderSlots.
 */
interface ScopeSeat {
  SessionProvider: SessionProviderComponent
  renderSlot(key: 'workbench.drawer.conversation', owner: object): ReactNode
}

/** Props for the workbench body: the framework global seat, the injected sources and actions, the panel's locale, and the children seats. */
export type WorkbenchPanelProps = PropsRuntime<'main'> & InjectFace<WorkbenchInjected> & PropsLocale<typeof NS> & ScopeSeat

/** Sentinel select value that triggers the host-native new-workspace flow. */
const NEW_WORKSPACE_VALUE = '__workbench-new-workspace__'

/** Drawer width bounds and its localStorage key (design §11.2). */
const DRAWER_MIN = 360
const DRAWER_MAX = 720
const DRAWER_WIDTH_KEY = 'dsh-workbench.drawer-width'

/** Toast auto-dismiss delay (design v2 mockup cadence). */
const TOAST_DISMISS_MS = 2200

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

/** Locale key for each job status shown in the operation detail. */
export const JOB_STATUS_KEY = {
  running: 'op.status.running',
  stopping: 'op.status.stopping',
  completed: 'op.status.completed',
  killed: 'op.status.killed',
  failed: 'op.status.failed',
} as const satisfies Record<JobRowContext['job']['status'], WorkbenchKey>

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

  /* Toast auto-dismiss (design v2: 2.2s, same cadence as the mockup). A later
     notify supersedes the timer by bumping seq; the effect re-arms on it. */
  useEffect(() => {
    if (toast === null) return
    const timer = window.setTimeout(() => { setToast(null) }, TOAST_DISMISS_MS)
    return () => { window.clearTimeout(timer) }
  }, [toast])

  /* ---- derived rows (kept from the read-only dashboard, now clickable) ---- */
  const { ids, byId, phase } = sessionsState
  const { rows: jobRowsBySession } = jobsState

  /* ---- workspace pick ----
     The pick is cached in localStorage so a page switch or reload restores
     it without a manual re-pick; once the workspace catalog is ready the
     cached id is validated and dropped if it no longer exists. The pick is
     the default target workspace for operation prepares. */
  const [workspacePick, setWorkspacePickState] = useState<WorkspaceId | undefined>(initialWorkspacePick)
  const setWorkspacePick = useCallback((id: WorkspaceId | undefined): void => {
    if (typeof localStorage !== 'undefined') {
      if (id === undefined) localStorage.removeItem(WORKSPACE_PICK_KEY)
      else localStorage.setItem(WORKSPACE_PICK_KEY, id)
    }
    setWorkspacePickState(id)
  }, [])
  const effectiveWorkspaceId = workspacePick

  // Drop a cached/stale pick whose workspace vanished from the catalog;
  // until the catalog is ready the cached id is given the benefit of doubt.
  useEffect(() => {
    if (workspaces.phase !== 'ready') return
    if (workspacePick !== undefined && !workspaces.items.some(w => w.workspaceId === workspacePick)) {
      setWorkspacePick(undefined)
    }
  }, [workspaces.phase, workspaces.items, workspacePick, setWorkspacePick])

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
    operationGeneration.current += 1
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
  const [previousSessionId, setPreviousSessionId] = useState<SessionId | null>(null)
  const [selectedJob, setSelectedJob] = useState<{ sessionId: SessionId; jobId: JobId } | null>(null)
  const currentWorkspace = useRef(effectiveWorkspaceId)
  currentWorkspace.current = effectiveWorkspaceId
  const [drawerWidth, setDrawerWidth] = useState(initialDrawerWidth)
  const [operation, setOperationState] = useState<OperationKind | null>(null)
  const operationGeneration = useRef(0)
  useEffect(() => () => { operationGeneration.current += 1 }, [])
  const setOperation = useCallback((kind: OperationKind | null): void => {
    operationGeneration.current += 1
    setOperationState(kind)
  }, [])
  const [operationDrafts, setOperationDrafts] = useState<Record<OperationKind, OperationDraft>>(() => ({
    'new-session': emptyOperationDraft(), 'run-workflow': emptyOperationDraft(), 'new-job': emptyOperationDraft(),
    'add-todo': emptyOperationDraft(), 'set-reminder': emptyOperationDraft(),
  }))

  const closeDrawer = useCallback(() => {
    drawerHolder.current?.release()
    drawerHolder.current = null
    setDrawerSessionId(null)
    setPreviousSessionId(null)
  }, [])
  const openDrawer = useCallback((sessionId: SessionId) => {
    setOperation(null)
    setSelectedJob(null)
    setTab('command')
    if (drawerHolder.current?.sessionId === sessionId) return
    const ref = actions.acquireDrawerSession(sessionId)
    if (ref === undefined) {
      notify(t('drawer.unavailable'), 'error')
      return
    }
    setPreviousSessionId(drawerHolder.current?.sessionId ?? null)
    drawerHolder.current?.release()
    drawerHolder.current = ref
    setDrawerSessionId(ref.sessionId)
  }, [actions, notify, t])

  useEffect(() => () => { drawerHolder.current?.release() }, [])

  useEffect(() => {
    if (operation === null && selectedJob === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setOperation(null)
      setSelectedJob(null)
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [operation, selectedJob, setOperation])

  useEffect(() => {
    if (drawerSessionId === null || operation !== null || selectedJob !== null || tab !== 'command') return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [drawerSessionId, closeDrawer, operation, selectedJob, tab])

  const resizeCleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => { resizeCleanup.current?.() }, [])
  const startResizing = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    resizeCleanup.current?.()
    event.preventDefault()
    const startX = event.clientX
    const startWidth = drawerWidth
    const onMove = (move: PointerEvent): void => {
      const next = Math.min(DRAWER_MAX, Math.max(DRAWER_MIN, startWidth + (startX - move.clientX)))
      setDrawerWidth(next)
    }
    const onUp = (): void => {
      resizeCleanup.current?.()
      resizeCleanup.current = null
      setDrawerWidth(width => {
        if (typeof localStorage !== 'undefined') localStorage.setItem(DRAWER_WIDTH_KEY, String(width))
        return width
      })
    }
    resizeCleanup.current = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }, [drawerWidth])

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
    /** Creation commands open their operation form on the command tab. */
    startOperation: kind => { setOperation(kind); setTab('command') },
    stopJob: (sessionId, jobId) => actions.stopJob(sessionId, jobId as JobId),
    switchTab: next => { operationGeneration.current += 1; setTab(next) },
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
  }), [actions, t, notify, tokenRows, reminders.records, setOperation])

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

  // The workspace selector lives in the header's top-right; it feeds the
  // default target workspace for operation prepares.
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
  const drawerTitle = drawerSessionId === null ? '' : byId[drawerSessionId]?.displayTitle ?? ''
  const targetWorkspace = drawerSessionId === null ? undefined : byId[drawerSessionId]?.cwd
  const jobDetail = selectedJob === null ? undefined : jobRows.find(row => row.sessionId === selectedJob.sessionId && row.job.id === selectedJob.jobId)
  const selectedWorkspace = workspaces.items.find(item => item.workspaceId === effectiveWorkspaceId)

  // The right-side operation surface renders only while a form, a job detail,
  // or the conversation drawer is open; the page is otherwise full-width.
  const rightPanelOpen = tab === 'command' && (operation !== null || selectedJob !== null || drawerSessionId !== null)

  return (
    <section className={cx(css.page, rightPanelOpen && css.operationsPage)} style={{ '--workbench-operation-width': `${drawerWidth}px` } as CSSProperties} aria-label={t('title')}>
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
              onChange={next => { operationGeneration.current += 1; setTab(next) }}
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
                useActivity={useActivity}
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
                onOpenJob={(sessionId, jobId) => { setOperation(null); setSelectedJob({ sessionId, jobId }) }}
                onStopJob={(sessionId, jobId) => {
                  void actions.stopJob(sessionId, jobId).then(ok => {
                    notify(ok ? t('cmd.done.stopJob') : t('cmd.failed.stopJob'), ok ? 'success' : 'error')
                  })
                }}
                onOpenTrend={() => { setTab('monitor') }}
              />
            )
            : (
              <>
              <MonitorTab
                t={t}
                useActivity={useActivity}
                useTrends={useTrends}
                trendsSampler={store.trends}
                workflowRows={workflowRows}
                goalRows={goalRows}
                tokenRows={tokenRows}
              />
              <DashboardCards t={t} sessions={{ ids, byId, phase }} jobRows={jobRows}
                workflowRows={workflowRows} goalRows={goalRows} reminders={reminders} tokenRows={tokenRows}
                tokenTotals={tokenTotals} onOpenSession={openDrawer}
                onStopJob={(sid, jid) => { void actions.stopJob(sid, jid).then(ok => { notify(t(ok ? 'cmd.done.stopJob' : 'cmd.failed.stopJob'), ok ? 'success' : 'error') }) }} />
              </>
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

      {tab === 'command' && operation !== null && (
        <aside className={css.operationSurface} aria-label={t('op.target')}>
          <OperationForm key={operation} kind={operation} draft={operationDrafts[operation]} t={t}
            target={operation === 'new-session' || drawerSessionId === null ? `${t('op.newTarget')} · ${selectedWorkspace?.path ?? t('toast.pickWorkspaceFirst')}` : `${drawerTitle} · ${targetWorkspace ?? ''}`}
            onChange={draft => { setOperationDrafts(previous => ({ ...previous, [operation]: draft })) }}
            onClose={() => { setOperation(null) }}
            onPrepare={async prompt => {
              const generation = operationGeneration.current
              if (operation === 'new-session' || drawerSessionId === null) {
                if (effectiveWorkspaceId === undefined) return false
                const ref = await actions.connectWorkspaceSession(effectiveWorkspaceId)
                try {
                  if (generation !== operationGeneration.current || currentWorkspace.current !== effectiveWorkspaceId) return false
                  if (!actions.primeSessionDraft(ref.sessionId, prompt)) return false
                  openDrawer(ref.sessionId)
                  notify(t('op.ready'))
                  return true
                } finally { ref.release() }
              }
              if (!actions.primeSessionDraft(drawerSessionId, prompt)) return false
              openDrawer(drawerSessionId)
              notify(t('op.ready'))
              return true
            }} />
        </aside>
      )}
      {tab === 'command' && operation === null && selectedJob !== null && (
        <aside className={css.operationSurface} aria-label={t('jobs.title')}>
          <div className={css.operationForm}>
            <h2>{jobDetail?.job.label ?? t('jobs.empty')}</h2>
            <p>{jobDetail?.sessionTitle}</p>
            <p>{jobDetail === undefined ? '' : t(JOB_STATUS_KEY[jobDetail.job.status])}</p>
            <p>{jobDetail?.job.progress}</p>
            <pre className={css.operationHint}>{jobDetail?.job.detail}</pre>
            <Button onClick={() => { openDrawer(selectedJob.sessionId) }}>{t('cmd.openSession')}</Button>
            <Button onClick={() => { setSelectedJob(null) }}>{t('op.close')}</Button>
          </div>
        </aside>
      )}
      {tab === 'command' && operation === null && selectedJob === null && drawerSessionId !== null && drawerHolder.current !== null && (
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
              {previousSessionId !== null && <Button variant="ghost" size="sm" aria-label={t('pager.prev')} onClick={() => { openDrawer(previousSessionId) }} icon={<IconChevronLeftOutlineRegular size={14} />} />}
              <div className={css.drawerTitle}><h2 className={css.drawerTitle}>{t('op.target')}: {drawerTitle}</h2><span className={css.operationHint}>{targetWorkspace}</span></div>
              <Button variant="ghost" size="sm" aria-label={t('drawer.openMain')}
                onClick={() => { actions.openSession(drawerSessionId) }}
                icon={<IconRightUpOutlineRegular size={14} />} />
              <Button variant="ghost" size="sm" aria-label={t('drawer.close')}
                onClick={closeDrawer}
                icon={<IconCloseOutlineRegular size={14} />} />
            </header>
            <div className={css.drawerBody}>
              <SessionProvider session={drawerHolder.current}>
                {renderSlot('workbench.drawer.conversation', {})}
              </SessionProvider>
            </div>
          </aside>
        </div>
      )}
    </section>
  )
}
