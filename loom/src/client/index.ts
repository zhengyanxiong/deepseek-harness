/** Workloom main panel registration and native Session retention actions. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import contribution from 'dsh-workloom/remote'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceFileText } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type { AttachSessionRequest, CleanupWorkspaceRequest, CreateTaskRequest, CreateVersionRequest, DeleteProjectRequest, DeleteTaskRequest, DeleteVersionRequest, GenerateLockRequest, PrepareWorkspaceRequest, ProjectConfig, StartAttemptRequest, TransitionTaskRequest, WorkspaceChangesRequest, ExecutionRequest, ReleaseExecutionRequest, UpdateProjectRequest, UpdateVersionRequest, UpdateTaskRequest } from 'dsh-workloom/types'
import { LoomPanel, type LoomInjected } from './LoomPanel.tsx'
import { ConversationEmbed } from './conversation/ConversationEmbed.tsx'
import { openFilePreview, openReviewPreview, previewTargetFromAddress, reviewIndexFromOptions, reviewTargetFromAddress } from './preview.ts'
import { NS, en, zh, type LoomKey } from './locales.ts'

const PANEL_ID = 'loom' as MainPanelId

/** The workspace-files read this bundle calls through the native Remote carrier. */
interface WorkspaceFilesFace {
  read(sessionId: SessionId, path: string, range: { readonly offset: number }, signal?: AbortSignal): Promise<RemoteResult<WorkspaceFileText>>
}

declare module '@deepseek-ai/dsh-api-gateway/client' {
  interface ClientRemote {
    /** Native workspace file reads, used by the Loom preview. */
    readonly workspaceFiles: WorkspaceFilesFace
  }
}

/** The right-Sidebar navigation method this bundle decorates while Loom is on screen. */
interface SidebarRightFace {
  openResource(address: string, options?: unknown): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Right-Sidebar navigation face; only the method Loom forwards is named here. */
    sidebarRight: SidebarRightFace
  }
}

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
          | { kind: 'text'; path: string; display: string; before: boolean; after: boolean; coarse: boolean; hunks: readonly { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: readonly string[] }[] }
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
  ctx.inject(['sidebarRight', 'layout'], (ui) => {
    ui.effect(() => {
      const controller = ui.sidebarRight
      const original = controller.openResource
      controller.openResource = function (address, options) {
        if (ui.layout.panelInfo.getSnapshot().activePanelId === PANEL_ID) {
          const review = reviewTargetFromAddress(address, reviewIndexFromOptions(options))
          if (review !== undefined) {
            openReviewPreview(review)
            return
          }
          const target = previewTargetFromAddress(address)
          if (target !== undefined) {
            openFilePreview({ ...target, mode: 'file' })
            return
          }
        }
        original.call(controller, address, options)
      }
      return () => { controller.openResource = original }
    }, 'loom: route file links to the workbench preview')
  })
  ctx.inject(['slots', 'locale', 'sessions', 'workspaces', 'remote.loom', 'remote.workspaceFiles'], (ui) => {
    ui.effect(() => ui.locale.register(NS, { en, zh }), 'loom: dictionary')
    const t = ui.locale.bind(NS)
    ui.slots.inject('main', () => ui.slots.register({
      name: 'main', key: PANEL_ID, locale: NS,
      children: { 'loom.conversation': { kind: 'single', scope: 'session' } },
      inject: (): LoomInjected => ({
        retainSession: id => ui.sessions.retain(id, { source: 'loom' }),
        loadSnapshot: () => ui.remote.loom.snapshot(),
        createProject: (request: ProjectConfig) => ui.remote.loom.createProject(request),
        updateProject: (request: UpdateProjectRequest) => ui.remote.loom.updateProject(request),
        deleteProject: (request: DeleteProjectRequest) => ui.remote.loom.deleteProject(request),
        createVersion: (request: CreateVersionRequest) => ui.remote.loom.createVersion(request),
        updateVersion: (request: UpdateVersionRequest) => ui.remote.loom.updateVersion(request),
        deleteVersion: (request: DeleteVersionRequest) => ui.remote.loom.deleteVersion(request),
        createTask: (request: CreateTaskRequest) => ui.remote.loom.createTask(request),
        updateTask: (request: UpdateTaskRequest) => ui.remote.loom.updateTask(request),
        deleteTask: (request: DeleteTaskRequest) => ui.remote.loom.deleteTask(request),
        generateLock: (request: GenerateLockRequest) => ui.remote.loom.generateLock(request),
        prepareWorkspace: (request: PrepareWorkspaceRequest) => ui.remote.loom.prepareWorkspace(request),
        startAttempt: (request: StartAttemptRequest) => ui.remote.loom.startAttempt(request),
        attachSession: (request: AttachSessionRequest) => ui.remote.loom.attachSession(request),
        transitionTask: (request: TransitionTaskRequest) => ui.remote.loom.transitionTask(request),
        workspaceChanges: (request: WorkspaceChangesRequest) => ui.remote.loom.workspaceChanges(request),
        readFile: (sessionId, path, offset, signal): Promise<RemoteResult<WorkspaceFileText>> => ui.remote.workspaceFiles.read(sessionId, path, { offset }, signal),
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
