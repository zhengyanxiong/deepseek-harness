/** File preview selected from the embedded conversation or the Diff tree. */
export interface LoomPreviewTarget {
  /** Session whose file address opened the preview, when a conversation link started it. */
  readonly sessionId?: string
  /** Workspace-relative or absolute path of the file to show. */
  readonly path: string
  /** Initial tab: a conversation link opens the file, a Diff row opens its changes. */
  readonly mode?: 'diff' | 'file'
}

/** One turn's changed files selected from a native `changes-review` address. */
export interface LoomReviewTarget {
  /** Session whose turn announced the changes. */
  readonly sessionId: string
  /** Sequence of the `workspace/changes` event that announced the turn. */
  readonly seq: number
  /** Turn number used for the review title. */
  readonly turn: number
  /** File index the changed-files row asked to open. */
  readonly index?: number
}

type Listener = () => void

let target: LoomPreviewTarget | undefined
let reviewTarget: LoomReviewTarget | undefined
const listeners = new Set<Listener>()

function publish(): void {
  for (const listener of listeners) listener()
}

/** Tiny observable shared by the client plugin and the Loom page. */
export const workspacePreview = {
  /** @returns the preview target, or undefined while the context aside is shown. */
  getSnapshot: (): LoomPreviewTarget | undefined => target,
  /** @param listener - called after every target change. @returns the unsubscriber. */
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  /** @param next - file to reveal in the aside. */
  open: (next: LoomPreviewTarget): void => {
    target = next
    publish()
  },
  /** Restore the context aside. */
  close: (): void => {
    if (target === undefined) return
    target = undefined
    publish()
  },
}

/** Observable for the aside's turn-change review. */
export const workspaceReviewPreview = {
  /** @returns the review target, or undefined while the context aside is shown. */
  getSnapshot: (): LoomReviewTarget | undefined => reviewTarget,
  /** @param listener - called after every target change. @returns the unsubscriber. */
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  /** @param next - turn review to reveal in the aside. */
  open: (next: LoomReviewTarget): void => {
    reviewTarget = next
    publish()
  },
  /** Restore the context aside. */
  close: (): void => {
    if (reviewTarget === undefined) return
    reviewTarget = undefined
    publish()
  },
}

/** @param next - file preview target. */
export function openFilePreview(next: LoomPreviewTarget): void {
  workspaceReviewPreview.close()
  workspacePreview.open(next)
}

/** @param next - turn review target. */
export function openReviewPreview(next: LoomReviewTarget): void {
  workspacePreview.close()
  workspaceReviewPreview.open(next)
}

/**
 * Read the changed-file index from a right-Sidebar open request.
 * @param options - options passed alongside the resource address.
 * @returns the index when the request names one, otherwise undefined.
 */
export function reviewIndexFromOptions(options: unknown): number | undefined {
  if (typeof options !== 'object' || options === null || !('params' in options)) return undefined
  const params = options.params
  if (typeof params !== 'object' || params === null || !('index' in params)) return undefined
  const index = params.index
  return typeof index === 'number' && Number.isSafeInteger(index) && index >= 0 ? index : undefined
}

/**
 * Read a native `dsh-resource://changes-review/session/…` address.
 * @param address - resource address passed to the right Sidebar.
 * @param index - file index carried by the opening request, when present.
 * @returns its review coordinates, or undefined for another resource.
 */
export function reviewTargetFromAddress(address: string, index?: number): LoomReviewTarget | undefined {
  const prefix = 'dsh-resource://changes-review/session/'
  if (!address.startsWith(prefix)) return undefined
  const parts = address.slice(prefix.length).split(/[?#]/u, 1)[0]?.split('/') ?? []
  if (parts.length !== 3) return undefined
  const [sessionId, seq, turn] = parts as [string, string, string]
  if (sessionId === '' || !/^\d+$/u.test(seq) || !/^[1-9]\d*$/u.test(turn)) return undefined
  if (index !== undefined && (!Number.isSafeInteger(index) || index < 0)) return undefined
  try {
    return { sessionId: decodeURIComponent(sessionId), seq: Number(seq), turn: Number(turn), ...index === undefined ? {} : { index } }
  } catch {
    return undefined
  }
}

/**
 * Read a native `dsh-resource://file/session/…` address.
 * @param address - resource address passed to the right Sidebar.
 * @returns its Session and decoded path, or undefined for another resource.
 */
export function previewTargetFromAddress(address: string): LoomPreviewTarget | undefined {
  const prefix = 'dsh-resource://file/session/'
  if (!address.startsWith(prefix)) return undefined
  const rest = address.slice(prefix.length).split(/[?#]/u, 1)[0] ?? ''
  const slash = rest.indexOf('/')
  if (slash <= 0) return undefined
  try {
    const sessionId = decodeURIComponent(rest.slice(0, slash))
    const path = rest.slice(slash + 1).split('/').map(segment => decodeURIComponent(segment)).join('/')
    return path === '' ? undefined : { sessionId, path }
  } catch {
    return undefined
  }
}
