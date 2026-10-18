/** File preview selected from the embedded conversation or the Diff tree. */
export interface LoomPreviewTarget {
  /** Session whose file address opened the preview, when a conversation link started it. */
  readonly sessionId?: string
  /** Workspace-relative or absolute path of the file to show. */
  readonly path: string
  /** Initial tab: a conversation link opens the file, a Diff row opens its changes. */
  readonly mode?: 'diff' | 'file'
}

type Listener = () => void

let target: LoomPreviewTarget | undefined
const listeners = new Set<Listener>()

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
    for (const listener of listeners) listener()
  },
  /** Restore the context aside. */
  close: (): void => {
    if (target === undefined) return
    target = undefined
    for (const listener of listeners) listener()
  },
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
