/**
 * Browser half of the Workbench panel: a top-level main panel registered into
 * the sidebar. The apply closure watches every session's job roster so the
 * cross-session job card stays current, reads the host reminder catalog
 * through the Remote API, owns the client-side activity/trend store, and wires
 * the click-to-execute actions onto uiWorkspace navigation and jobs.kill.
 * Design §11 (v3): the panel also hosts two embedded NATIVE conversation
 * surfaces — the composer InputBar and the right drawer — through the
 * `conversation.content` factory slot bound to explicitly retained Session
 * references (the ui-subagent sidebar-chat architecture).
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-job-controller/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { DirectoryListing } from '@deepseek-ai/dsh-api-remotes/client'
import { WorkbenchPanel, type DirectoryPickOutcome, type RemindersSnapshot, type WorkbenchInjected } from './WorkbenchPanel.tsx'
import { ConversationEmbed } from './ConversationEmbed.tsx'
import { MonitorTab } from './MonitorTab.tsx'
import { WorkbenchIcon } from './WorkbenchIcon.tsx'
import { getWorkbenchStore } from './store.ts'
import { en, NS, zh, type WorkbenchKey } from './locales.ts'

/** Stable panel id the sidebar entry and the `main` keyed slot share. */
const PANEL_ID = 'workbench' as MainPanelId

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Workbench panel copy. */
    workbench: WorkbenchKey
  }
  interface SlotMap {
    /** Embedded native conversation bound by the workbench composer seat. */
    'workbench.composer.conversation': { kind: 'single'; scope: 'session'; owner: { readonly mode: 'composer' } }
    /** Embedded native conversation bound by the workbench drawer seat. */
    'workbench.drawer.conversation': { kind: 'single'; scope: 'session'; owner: { readonly mode: 'drawer' } }
  }
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    /** Workbench composer InputBar seat. */
    workbenchComposer: unknown
    /** Workbench right-drawer conversation seat. */
    workbenchDrawer: unknown
  }
}

/** Services the panel shell, its sidebar entry, the job roster, the reminder catalog, the session catalog, and startup selection read. */
export const inject = ['slots', 'locale', 'jobs', 'sessions', 'layout', 'remote', 'remote.schedule']

/**
 * Build a read-only host reminder catalog: one lazy Remote read on first
 * subscription, refreshed on `schedule/changed` and on connection reset.
 * @param ctx - browser services used by these contributions.
 * @returns the bare observable the renderer binds as `useReminders`.
 */
function createReminderSource(ctx: ClientContext): HostObservable<RemindersSnapshot> {
  let snapshot: RemindersSnapshot = { records: [], status: 'loading' }
  const listeners = new Set<() => void>()
  let disposers: Array<() => void> = []
  let epoch = 0

  const publish = (next: RemindersSnapshot): void => {
    snapshot = next
    for (const listener of listeners) listener()
  }

  const refresh = async (): Promise<void> => {
    const current = ++epoch
    const result = await ctx.remote.schedule.catalog()
    if (current !== epoch) return
    publish(result.ok
      ? { records: result.value, status: 'ready' }
      : { records: snapshot.records, status: 'error' })
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1) {
        disposers = [
          ctx.remote.$on('schedule/changed', () => { void refresh() }),
          ctx.on('connection/reset', () => { void refresh() }),
        ]
        void refresh()
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size !== 0) return
        for (const dispose of disposers) dispose()
        disposers = []
        epoch++
      }
    },
  }
}

/**
 * Register the Workbench main panel and its sidebar entry, keep the
 * cross-session job roster watched while the plugin lives, read the host
 * reminder catalog, and expose the client-side store plus the click actions.
 * @param ctx - browser services used by these contributions.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'workbench: dictionary')

  ctx.effect(() => {
    const watches = new Map<string, () => void>()
    const sync = (): void => {
      const ids = ctx.sessions.list.getSnapshot().ids
      const wanted = new Set(ids.map(String))
      for (const [key, stop] of watches) {
        if (!wanted.has(key)) {
          stop()
          watches.delete(key)
        }
      }
      for (const id of ids) {
        const key = String(id)
        if (!watches.has(key)) watches.set(key, ctx.jobs.watchRows(id))
      }
    }
    sync()
    const off = ctx.sessions.list.subscribe(sync)
    return () => {
      off()
      for (const stop of watches.values()) stop()
    }
  }, 'workbench: job rosters')

  const reminders = createReminderSource(ctx)
  const store = getWorkbenchStore()

  /**
   * Resolve the reusable or newly created blank Session of one Workspace and
   * retain it for the composer seat. Navigation-free: the workbench panel
   * stays visible while the native InputBar binds to the returned reference.
   * @param workspaceId - chosen Workspace.
   * @returns the retained Session reference (caller releases on switch/unmount).
   */
  const connectComposerWorkspace = async (workspaceId: WorkspaceId): Promise<SessionReference> => {
    const uiWorkspace = ctx.get('uiWorkspace')
    if (uiWorkspace === undefined) throw new Error('workbench: uiWorkspace unavailable')
    const sessionId = await uiWorkspace.connectWorkspace(workspaceId)
    return ctx.sessions.retain(sessionId, { source: 'workbenchComposer' })
  }

  /**
   * Retain one known Session for the drawer seat.
   * @param sessionId - catalogued Session to preview.
   * @returns the retained reference, or undefined when unknown/unretainable.
   */
  const acquireDrawerSession = (sessionId: SessionId): SessionReference | undefined => {
    if (ctx.sessions.list.getSnapshot().byId[sessionId] === undefined) return undefined
    try {
      return ctx.sessions.retain(sessionId, { source: 'workbenchDrawer' })
    } catch {
      return undefined
    }
  }

/**
 * Run the host-native directory pick-and-register flow for a new Workspace.
 * Tries the OS chooser first; a browse-only host refuses that verb, which is
 * the signal to offer the in-app directory browser instead — never a silent
 * no-op (the raw refusal used to escape as an unhandled rejection).
 * @returns the adoption outcome for the panel to act on.
 */
const pickWorkspaceDirectory = async (): Promise<DirectoryPickOutcome> => {
  const uiWorkspace = ctx.get('uiWorkspace')
  const workspaces = ctx.get('workspaces')
  if (uiWorkspace === undefined || workspaces === undefined) return { kind: 'error' }
  try {
    const path = await uiWorkspace.pickDirectory()
    if (path === null) return { kind: 'cancelled' }
    const created = await workspaces.create({ path })
    return { kind: 'workspace', workspaceId: created.workspaceId }
  } catch {
    // Native chooser refused (browse backend) or failed: offer the browser.
  }
  try {
    return { kind: 'browse', home: await uiWorkspace.listDirectory() }
  } catch {
    return { kind: 'error' }
  }
}

/** List one directory level for the in-app picker; undefined on failure. */
const browseWorkspaceDirectory = async (path?: string): Promise<DirectoryListing | undefined> => {
  const uiWorkspace = ctx.get('uiWorkspace')
  if (uiWorkspace === undefined) return undefined
  try {
    return await uiWorkspace.listDirectory(path)
  } catch {
    return undefined
  }
}

/** Create one child directory in the in-app picker; undefined on failure. */
const createWorkspaceDirectory = async (path: string, name: string): Promise<string | undefined> => {
  const uiWorkspace = ctx.get('uiWorkspace')
  if (uiWorkspace === undefined) return undefined
  try {
    return await uiWorkspace.createDirectory(path, name)
  } catch {
    return undefined
  }
}

/** Adopt an absolute host path as a Workspace; undefined on failure. */
const adoptWorkspacePath = async (path: string): Promise<WorkspaceId | undefined> => {
  const workspaces = ctx.get('workspaces')
  if (workspaces === undefined) return undefined
  try {
    return (await workspaces.create({ path })).workspaceId
  } catch {
    return undefined
  }
}

  /**
   * Prime the workbench composer Session's native input machine: replace the
   * draft with a command template (or clear it for a fresh session) and return
   * the keyboard to the InputBar — all without leaving the workbench panel.
   * @param sessionId - bound composer Session.
   * @param prompt - command template text; undefined clears the draft.
   * @returns false when the input machine is busy or unavailable.
   */
  const primeComposerDraft = (sessionId: SessionId, prompt?: string): boolean => {
    const conversation = ctx.get('conversation')
    const binding = conversation === undefined ? undefined : ctx.sessions.binding(sessionId)
    if (conversation === undefined || binding === undefined) return false
    const result = conversation.input.requestDraftInitialization(binding, {
      ...(prompt === undefined ? {} : { prompt }),
      clearPreviousDraft: true,
    })
    if (result === 'blocked') return false
    try {
      conversation.input.for(binding.ctx).focus()
    } catch {
      // The embedded InputBar has not mounted yet; the draft still lands.
    }
    return true
  }

  const t = ctx.locale.bind(NS)
  const selectWorkbenchOnStartup = (): void => {
    // Select the panel only on a fresh boot: skip when another panel is open
    // or when a session is already retained by the main view (a deep link or a
    // resumed session keeps the conversation).
    if (ctx.layout.panelInfo.getSnapshot().activePanelId !== null) return
    const viewing = Object.values(ctx.sessions.list.getSnapshot().byId)
      .some(row => (row.retainedBy.mainView ?? 0) > 0)
    if (viewing) return
    ctx.layout.selectPanel(PANEL_ID)
  }
  ctx.slots.inject('main', () => {
    const dispose = ctx.slots.register({
      name: 'main',
      key: PANEL_ID,
      locale: NS,
      children: {
        'workbench.composer.conversation': { kind: 'single', scope: 'session' },
        'workbench.drawer.conversation': { kind: 'single', scope: 'session' },
      },
      inject: (): WorkbenchInjected => ({
        hooks: {
          jobs: ctx.jobs.state,
          reminders,
          activity: store.activity,
          trends: store.trends,
        },
        actions: {
          // uiWorkspace is registered by the ui-workspace client plugin; the
          // bundle load order is not guaranteed, so resolve it per call.
          openSession: sessionId => { ctx.get('uiWorkspace')?.openSession(sessionId) },
          connectComposerWorkspace,
          acquireDrawerSession,
          /** New-workspace directory picking: native chooser, else in-app browse. */
          pickWorkspaceDirectory,
          browseWorkspaceDirectory,
          createWorkspaceDirectory,
          adoptWorkspacePath,
          /** Inject a command template into the composer input machine (design §11.5). */
          primeComposerDraft,
          stopJob: async (sessionId, jobId) => (await ctx.jobs.kill(sessionId, jobId)).ok,
        },
      }),
    }, WorkbenchPanel)
    selectWorkbenchOnStartup()
    return dispose
  })
  // Embedded native conversation seats (design §11): one component, two slot
  // surfaces; the panel binds each through its own explicit SessionProvider.
  ctx.slots.inject('workbench.composer.conversation', () => ctx.slots.register({
    name: 'workbench.composer.conversation',
  }, ConversationEmbed))
  ctx.slots.inject('workbench.drawer.conversation', () => ctx.slots.register({
    name: 'workbench.drawer.conversation',
  }, ConversationEmbed))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 5,
    locale: NS,
    label: () => t('panel'),
  }, WorkbenchIcon))
}

// Re-exported for the smoke harness so it can renderToString the 监控 tab
// directly; the bundle is a closure factory, so one extra export is inert.
export { MonitorTab }
