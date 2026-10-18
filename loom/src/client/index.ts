/** Loom main panel registration and native Session retention actions. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import contribution from 'dsh-loom/remote'
import type { AttachSessionRequest, CleanupWorkspaceRequest, CreateTaskRequest, CreateVersionRequest, GenerateLockRequest, PrepareWorkspaceRequest, ProjectConfig, StartAttemptRequest, TransitionTaskRequest, WorkspaceChangesRequest, ExecutionRequest, ReleaseExecutionRequest } from 'dsh-loom/types'
import { LoomPanel, type LoomInjected } from './LoomPanel.tsx'
import { ConversationEmbed } from './conversation/ConversationEmbed.tsx'
import { NS, en, zh, type LoomKey } from './locales.ts'

const PANEL_ID = 'loom' as MainPanelId

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { loom: LoomKey }
  interface SlotMap {
    /** Native conversation hosted by Loom's explicit SessionProvider. */
    'loom.conversation': { kind: 'single'; scope: 'session' }
  }
  interface SlotFactoryMap {
    /** Native file comparison registered by ui-deliverables; Loom supplies computed hunks. */
    'deliverables.fileDiff': {
      scope: 'root'
      props: {
        state: 'missing' | 'error' | 'loading' | { kind: 'binary' } | { kind: 'oversized' }
          | { kind: 'text'; path: string; hunks: readonly { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: readonly string[] }[] }
        split: boolean
        wrap: boolean
        retry: () => void
      }
    }
  }
}
declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { loom: unknown }
}

/** The generated namespace is mounted here, so only the carrier is required up front. */
export const inject = ['remote']

/** Register an isolated Loom page without changing the current panel selection.
 * @param ctx - Client registration context.
 */
export function apply(ctx: ClientContext): void {
  // Mount the generated namespace so the page fiber below can require `remote.loom`.
  ctx.effect(() => {
    const mounting = ctx.remote.$mount(contribution)
    return async () => { await (await mounting)() }
  }, 'loom: remote namespace')
  ctx.inject(['slots', 'locale', 'sessions', 'workspaces', 'remote.loom'], (ui) => {
    ui.effect(() => ui.locale.register(NS, { en, zh }), 'loom: dictionary')
    const t = ui.locale.bind(NS)
    ui.slots.inject('main', () => ui.slots.register({
      name: 'main', key: PANEL_ID, locale: NS,
      children: { 'loom.conversation': { kind: 'single', scope: 'session' } },
      inject: (): LoomInjected => ({
        retainSession: id => ui.sessions.retain(id, { source: 'loom' }),
        loadSnapshot: () => ui.remote.loom.snapshot(),
        createProject: (request: ProjectConfig) => ui.remote.loom.createProject(request),
        createVersion: (request: CreateVersionRequest) => ui.remote.loom.createVersion(request),
        createTask: (request: CreateTaskRequest) => ui.remote.loom.createTask(request),
        generateLock: (request: GenerateLockRequest) => ui.remote.loom.generateLock(request),
        prepareWorkspace: (request: PrepareWorkspaceRequest) => ui.remote.loom.prepareWorkspace(request),
        startAttempt: (request: StartAttemptRequest) => ui.remote.loom.startAttempt(request),
        attachSession: (request: AttachSessionRequest) => ui.remote.loom.attachSession(request),
        transitionTask: (request: TransitionTaskRequest) => ui.remote.loom.transitionTask(request),
        workspaceChanges: (request: WorkspaceChangesRequest) => ui.remote.loom.workspaceChanges(request),
        cleanupWorkspace: (request: CleanupWorkspaceRequest) => ui.remote.loom.cleanupWorkspace(request),
        acquireExecution: (request: ExecutionRequest) => ui.remote.loom.acquireExecution(request),
        releaseExecution: (request: ReleaseExecutionRequest) => ui.remote.loom.releaseExecution(request),
        takeoverExecution: (request: ExecutionRequest) => ui.remote.loom.takeoverExecution(request),
        createSessionInWorkspace: async (path: string) => {
          const workspace = await ui.workspaces.create({ path })
          return ui.sessions.create({ workspaceId: workspace.workspaceId })
        },
      }),
    }, LoomPanel))
    ui.slots.inject('loom.conversation', () => ui.slots.register({ name: 'loom.conversation' }, ConversationEmbed))
    ui.slots.inject('sidebar.panellist', () => ui.slots.register({
      name: 'sidebar.panellist', id: PANEL_ID, order: 6, locale: NS, label: () => t('panel'),
    }, LoomSidebarIcon))
  })
}

/** Text-only sidebar mark until Loom artwork is approved. */
function LoomSidebarIcon() {
  return 'L'
}
