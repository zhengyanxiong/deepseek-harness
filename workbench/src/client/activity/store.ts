/**
 * Workbench client-side aggregates: the realtime activity stream, the
 * resource-trend time-series sampler, and the command MRU list.
 *
 * Framework-agnostic snapshot/subscribe sources the panel binds like the host
 * observables. SSR-safe: nothing touches timers or storage until `start()` /
 * `feed()` runs inside an effect, so a server render stays inert.
 */

/** Visual kind of one activity event; maps 1:1 onto ui-primitives StateDot states. */
export type ActivityKind = 'done' | 'ongoing' | 'warning' | 'error' | 'idle'

/** One realtime activity row. */
export interface ActivityEvent {
  /** Monotonic id, newest first. */
  readonly id: number
  /** Epoch milliseconds of the (possibly coalesced) latest update. */
  readonly ts: number
  /** Local HH:mm label. */
  readonly time: string
  readonly kind: ActivityKind
  readonly text: string
  /** Coalescing key: same source + kind within the window merge into one row. */
  readonly source: string
}

/** Activity stream snapshot consumed by the monitor tab. */
export interface ActivitySnapshot {
  readonly events: readonly ActivityEvent[]
  /** Connection-liveness projection; the current differ feeds on host-observable updates only, so it stays 'live'. */
  readonly status: 'live' | 'reconnecting' | 'stale'
}

/** Minimal session row the differ reads from the session list snapshot. */
export interface FeedSessionRow {
  readonly id: string
  readonly displayTitle: string
  readonly running: boolean
}

/** Minimal job row the differ reads from the jobs snapshot. */
export interface FeedJobRow {
  readonly id: string
  readonly label: string
  readonly status: 'running' | 'stopping' | 'completed' | 'killed' | 'failed'
  readonly progress?: string
}

export interface ActivityFeedState {
  readonly sessions: { readonly ids: readonly string[]; readonly byId: Readonly<Record<string, FeedSessionRow | undefined>> }
  readonly jobs: { readonly rows: Readonly<Record<string, readonly FeedJobRow[] | undefined>> }
}

export interface ActivityStore {
  getSnapshot(): ActivitySnapshot
  subscribe(listener: () => void): () => void
  /** Push one event; same source+kind inside the coalesce window replaces the newest row. */
  push(event: { source: string; kind: ActivityKind; text: string }): void
  /** Mark every current event seen (the "N 条新事件" chip resets). */
  markAllRead(): void
}

const hhmm = (ts: number): string => {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Create the capped, coalescing activity stream.
 * @param options - cap on retained rows and the same-source merge window.
 * @returns the snapshot/subscribe source plus push/markAllRead writers.
 */
export function createActivityStore(options: { cap?: number; coalesceMs?: number } = {}): ActivityStore & { readonly lastSeenTs: number } {
  const cap = options.cap ?? 200
  const coalesceMs = options.coalesceMs ?? 250
  let events: ActivityEvent[] = []
  let status: ActivitySnapshot['status'] = 'live'
  let lastSeenTs = 0
  let seq = 0
  // Cached snapshot: useSyncExternalStore requires getSnapshot to return a
  // stable reference until the store actually notifies a change.
  let snapshot: ActivitySnapshot = { events, status }
  const listeners = new Set<() => void>()

  const notify = (): void => { for (const listener of listeners) listener() }

  return {
    get lastSeenTs() { return lastSeenTs },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    push(event) {
      const now = Date.now()
      const head = events[0]
      if (head !== undefined && head.source === event.source && head.kind === event.kind && now - head.ts < coalesceMs) {
        events = [{ ...head, ts: now, time: hhmm(now), text: event.text }, ...events.slice(1)]
      } else {
        events = [{ id: ++seq, ts: now, time: hhmm(now), kind: event.kind, text: event.text, source: event.source }, ...events]
        if (events.length > cap) events = events.slice(0, cap)
      }
      snapshot = { events, status }
      notify()
    },
    markAllRead() {
      lastSeenTs = events[0]?.ts ?? Date.now()
      notify()
    },
  }
}

/** Locale-facing labels the differ needs to render event copy. */
export interface ActivityFeedLabels {
  sessionCreated(title: string): string
  sessionStarted(title: string): string
  sessionFinished(title: string): string
  jobStarted(label: string): string
  jobProgress(label: string, progress: string): string
  jobFinished(label: string): string
  jobFailed(label: string): string
  jobStopped(label: string): string
}

/**
 * Diff two session/job snapshots into activity events and push them.
 * Pure with respect to the store: the caller keeps the previous snapshot.
 * @param store - activity sink.
 * @param previous - last fed snapshot, or undefined on the first feed.
 * @param next - the snapshot just observed.
 * @param labels - locale copy builder.
 */
export function diffActivityFeed(
  store: ActivityStore,
  previous: ActivityFeedState | undefined,
  next: ActivityFeedState,
  labels: ActivityFeedLabels,
): void {
  const prevSessions = previous?.sessions.byId ?? {}
  for (const id of next.sessions.ids) {
    const row = next.sessions.byId[id]
    if (row === undefined) continue
    const prev = prevSessions[id]
    if (prev === undefined) {
      store.push({ source: `session/${id}`, kind: 'idle', text: labels.sessionCreated(row.displayTitle) })
    } else if (!prev.running && row.running) {
      store.push({ source: `session/${id}`, kind: 'ongoing', text: labels.sessionStarted(row.displayTitle) })
    } else if (prev.running && !row.running) {
      store.push({ source: `session/${id}`, kind: 'done', text: labels.sessionFinished(row.displayTitle) })
    }
  }

  const prevJobs = new Map<string, FeedJobRow>()
  if (previous !== undefined) {
    for (const [sessionId, jobs] of Object.entries(previous.jobs.rows)) {
      for (const job of jobs ?? []) prevJobs.set(`${sessionId}/${job.id}`, job)
    }
  }
  for (const [sessionId, jobs] of Object.entries(next.jobs.rows)) {
    for (const job of jobs ?? []) {
      const key = `${sessionId}/${job.id}`
      const prev = prevJobs.get(key)
      if (prev === undefined) {
        if (job.status === 'running' || job.status === 'stopping') {
          store.push({ source: `job/${key}`, kind: 'ongoing', text: labels.jobStarted(job.label) })
        }
        continue
      }
      const live = job.status === 'running' || job.status === 'stopping'
      const wasLive = prev.status === 'running' || prev.status === 'stopping'
      if (live && job.progress !== undefined && job.progress !== prev.progress) {
        store.push({ source: `job/${key}`, kind: 'ongoing', text: labels.jobProgress(job.label, job.progress) })
      } else if (wasLive && job.status === 'completed') {
        store.push({ source: `job/${key}`, kind: 'done', text: labels.jobFinished(job.label) })
      } else if (wasLive && job.status === 'failed') {
        store.push({ source: `job/${key}`, kind: 'error', text: labels.jobFailed(job.label) })
      } else if (wasLive && job.status === 'killed') {
        store.push({ source: `job/${key}`, kind: 'idle', text: labels.jobStopped(job.label) })
      }
    }
  }
}

/** One sampled resource point; fields mirror the 指挥台 resource strip. */
export interface TrendPoint {
  /** Epoch seconds. */
  readonly t: number
  readonly input: number
  readonly output: number
  /** Average context occupancy percent across sessions. */
  readonly ctx: number
  /** Running job count (throughput proxy). */
  readonly jobs: number
}

export type TrendWindow = '1h' | '6h' | '24h'

export const TREND_WINDOWS: readonly TrendWindow[] = ['1h', '6h', '24h']

const WINDOW_MS: Record<TrendWindow, number> = { '1h': 3_600_000, '6h': 21_600_000, '24h': 86_400_000 }

/** Sparkline series bundle for one window. */
export interface TrendSeries {
  readonly input: readonly number[]
  readonly output: readonly number[]
  readonly ctx: readonly number[]
  readonly jobs: readonly number[]
  readonly last: TrendPoint | null
}

export interface TrendSampler {
  getSnapshot(): { readonly last: TrendPoint | null }
  subscribe(listener: () => void): () => void
  /** Start the 30s interval; safe to call repeatedly and inert without a DOM. */
  start(): void
  /** Stop the interval (panel unmount). */
  stop(): void
  /** Keep the latest derived totals; the interval samples them into a point. */
  feed(totals: { input: number; output: number; ctx: number; jobs: number }): void
  /** Points for one window, downsampled to at most 120 buckets. */
  series(window: TrendWindow): TrendSeries
}

const TREND_STORAGE_KEY = 'dsh-workbench.trends.v1'
const SAMPLE_MS = 30_000
const PERSIST_CAP = (86_400_000 / SAMPLE_MS) | 0
const SERIES_BUCKETS = 120

interface TrendStorageShape { readonly v: 1; readonly points: TrendPoint[] }

const storageAvailable = (): boolean => typeof localStorage !== 'undefined'

const loadPersisted = (): TrendPoint[] => {
  if (!storageAvailable()) return []
  try {
    const raw = localStorage.getItem(TREND_STORAGE_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw) as TrendStorageShape
    if (parsed.v !== 1 || !Array.isArray(parsed.points)) return []
    return parsed.points.filter(point => Number.isFinite(point.t))
  } catch {
    return []
  }
}

const savePersisted = (points: TrendPoint[]): void => {
  if (!storageAvailable()) return
  try {
    localStorage.setItem(TREND_STORAGE_KEY, JSON.stringify({ v: 1, points }))
  } catch {
    // Quota or privacy mode: the hot ring still feeds the 1h window.
  }
}

/**
 * Create the 30s resource sampler: a hot ring for the 1h sparkline plus a
 * localStorage-backed day-long series the wider windows downsample.
 * @returns the sampler source.
 */
export function createTrendSampler(): TrendSampler {
  let points: TrendPoint[] = loadPersisted()
  let pending: { input: number; output: number; ctx: number; jobs: number } | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let last: TrendPoint | null = points.length === 0 ? null : points[points.length - 1] ?? null
  // Cached snapshot for useSyncExternalStore: stable reference between notifies.
  let snapshot: { readonly last: TrendPoint | null } = { last }
  const listeners = new Set<() => void>()

  const notify = (): void => { for (const listener of listeners) listener() }

  const sample = (): void => {
    if (pending === null) return
    const cutoff = Date.now() - PERSIST_CAP * SAMPLE_MS
    const point: TrendPoint = {
      t: Math.round(Date.now() / 1000),
      input: Math.round(pending.input),
      output: Math.round(pending.output),
      ctx: Math.round(pending.ctx),
      jobs: Math.round(pending.jobs),
    }
    if (last !== null && point.t - last.t < SAMPLE_MS / 2000) return
    points = [...points.filter(p => p.t * 1000 >= cutoff), point]
    last = point
    snapshot = { last }
    savePersisted(points)
    notify()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    start() {
      if (timer !== null || typeof setInterval === 'undefined') return
      timer = setInterval(sample, SAMPLE_MS)
    },
    stop() {
      if (timer === null) return
      clearInterval(timer)
      timer = null
    },
    feed(totals) {
      pending = totals
      // Keep data flowing even between interval edges (first feed, tab switches).
      if (last === null || Date.now() - last.t * 1000 >= SAMPLE_MS) sample()
    },
    series(window) {
      const since = Date.now() - WINDOW_MS[window]
      const slice = points.filter(point => point.t * 1000 >= since)
      if (slice.length === 0) return { input: [], output: [], ctx: [], jobs: [], last }
      const bucketMs = WINDOW_MS[window] / SERIES_BUCKETS
      const buckets: TrendPoint[][] = []
      let bucketStart = (slice[0]?.t ?? 0) * 1000
      let current: TrendPoint[] = []
      for (const point of slice) {
        const at = point.t * 1000
        if (at - bucketStart > bucketMs && current.length > 0) {
          buckets.push(current)
          current = []
          bucketStart = at
        }
        current.push(point)
      }
      if (current.length > 0) buckets.push(current)
      const avg = (values: readonly number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length
      return {
        input: buckets.map(bucket => avg(bucket.map(p => p.input))),
        output: buckets.map(bucket => avg(bucket.map(p => p.output))),
        ctx: buckets.map(bucket => avg(bucket.map(p => p.ctx))),
        jobs: buckets.map(bucket => avg(bucket.map(p => p.jobs))),
        last,
      }
    },
  }
}

/** MRU list for the command palette's "最近使用" group (P0; in-memory is enough). */
export interface MruList {
  readonly ids: readonly string[]
  add(id: string): void
}

export function createMruList(cap = 5): MruList {
  let ids: string[] = []
  return {
    get ids() { return ids },
    add(id) {
      ids = [id, ...ids.filter(existing => existing !== id)].slice(0, cap)
    },
  }
}

/** Panel-singleton aggregates, created lazily so server renders stay inert. */
export interface WorkbenchStore {
  readonly activity: ActivityStore
  readonly trends: TrendSampler
  readonly mru: MruList
}

let singleton: WorkbenchStore | undefined

/** Get (or create) the module-level store shared across mounts of the panel. */
export function getWorkbenchStore(): WorkbenchStore {
  if (singleton === undefined) {
    singleton = { activity: createActivityStore(), trends: createTrendSampler(), mru: createMruList() }
  }
  return singleton
}
