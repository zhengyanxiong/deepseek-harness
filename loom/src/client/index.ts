/** Workloom main panel registration and native Session retention actions. */
import { createElement } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { DraftInitializationOptions, DraftInitializationResult, ViewTab } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionBinding } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import contribution from 'dsh-workloom/remote'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceFileText } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type { AttachSessionRequest, CleanupWorkspaceRequest, CreateTaskRequest, CreateVersionRequest, DeleteProjectRequest, DeleteTaskRequest, DeleteVersionRequest, GenerateLockRequest, PrepareWorkspaceRequest, ProjectConfig, StartAttemptRequest, TransitionTaskRequest, WorkspaceChangesRequest, ExecutionRequest, ReleaseExecutionRequest, UpdateProjectRequest, UpdateVersionRequest, UpdateTaskRequest, RegisterTemporarySessionRequest, RegisterWorkspaceRequest, RepositoryBranchesRequest, InspectWorkspaceRequest } from 'dsh-workloom/types'
import { LoomPanel, type LoomInjected } from './LoomPanel.tsx'
import { LoomMark } from './LoomMark.tsx'
import { LoomNoticeHost } from './LoomNoticeHost.tsx'
import { pushLoomNotice, reportLoomFailure } from './feedback.ts'
import { ConversationEmbed } from './conversation/ConversationEmbed.tsx'
import { openFilePreview, openReviewPreview, previewTargetFromAddress, reviewIndexFromOptions, reviewTargetFromAddress } from './preview.ts'
import { NS, en, zh, type LoomKey } from './locales.ts'

const PANEL_ID = 'loom' as MainPanelId

/** The workspace-files read this bundle calls through the native Remote carrier. */
interface WorkspaceFilesFace {
  read(sessionId: SessionId, path: string, range: { readonly offset: number }, signal?: AbortSignal): Promise<RemoteResult<WorkspaceFileText>>
}

/** One native Agent preset as the project form offers it. */
interface AgentPresetRowFace {
  readonly id: string
  readonly isDefault: boolean
  readonly name?: string
  readonly description?: string
  readonly broken?: string
}

/** The Agent-preset roster read used by Workloom project settings. */
interface AgentPresetsFace {
  list(): Promise<RemoteResult<{ presets: readonly AgentPresetRowFace[] }>>
}

declare module '@deepseek-ai/dsh-api-gateway/client' {
  interface ClientRemote {
    /** Native workspace file reads, used by the Loom preview. */
    readonly workspaceFiles: WorkspaceFilesFace
    /** Native Agent-preset roster, used by project settings. */
    readonly agentPresets: AgentPresetsFace
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
  ctx.inject(['slots', 'locale', 'sessions', 'workspaces', 'remote.loom', 'remote.workspaceFiles', 'remote.agentPresets', 'remote.directoryPicker'], (ui) => {
    ui.effect(() => ui.locale.register(NS, { en, zh }), 'loom: dictionary')
    const t = ui.locale.bind(NS)
    const notified = async <T,>(promise: Promise<RemoteResult<T>>, success?: LoomKey): Promise<RemoteResult<T>> => {
      let result: RemoteResult<T>
      try {
        result = await promise
      } catch (error) {
        pushLoomNotice('error', t('notice.operationFailed'), error instanceof Error ? error.message : String(error))
        throw error
      }
      if (!result.ok) reportLoomFailure(t, result.error)
      else if (success !== undefined) pushLoomNotice('success', t(success))
      return result
    }
    ui.slots.inject('main', () => ui.slots.register({
      name: 'main', key: PANEL_ID, locale: NS,
      children: { 'loom.conversation': { kind: 'single', scope: 'session' } },
      inject: (): LoomInjected => ({
        retainSession: id => ui.sessions.retain(id, { source: 'loom' }),
        loadSnapshot: () => notified(ui.remote.loom.snapshot()),
        createProject: (request: ProjectConfig) => notified(ui.remote.loom.createProject(request), 'notice.projectCreated'),
        updateProject: (request: UpdateProjectRequest) => notified(ui.remote.loom.updateProject(request), 'notice.projectUpdated'),
        deleteProject: (request: DeleteProjectRequest) => notified(ui.remote.loom.deleteProject(request), 'notice.projectDeleted'),
        createVersion: (request: CreateVersionRequest) => notified(ui.remote.loom.createVersion(request), 'notice.versionCreated'),
        updateVersion: (request: UpdateVersionRequest) => notified(ui.remote.loom.updateVersion(request), 'notice.versionUpdated'),
        deleteVersion: (request: DeleteVersionRequest) => notified(ui.remote.loom.deleteVersion(request), 'notice.versionDeleted'),
        createTask: (request: CreateTaskRequest) => notified(ui.remote.loom.createTask(request), 'notice.taskCreated'),
        updateTask: (request: UpdateTaskRequest) => notified(ui.remote.loom.updateTask(request), 'notice.taskUpdated'),
        deleteTask: (request: DeleteTaskRequest) => notified(ui.remote.loom.deleteTask(request), 'notice.taskDeleted'),
        generateLock: (request: GenerateLockRequest) => notified(ui.remote.loom.generateLock(request), 'notice.lockGenerated'),
        prepareWorkspace: (request: PrepareWorkspaceRequest) => notified(ui.remote.loom.prepareWorkspace(request)),
        registerWorkspace: (request: RegisterWorkspaceRequest) => notified(ui.remote.loom.registerWorkspace(request)),
        repositoryBranches: (request: RepositoryBranchesRequest) => ui.remote.loom.repositoryBranches(request),
        inspectWorkspace: (request: InspectWorkspaceRequest) => ui.remote.loom.inspectWorkspace(request),
        pickDirectory: async () => {
          const result = await ui.remote.directoryPicker.pick()
          if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
          return result.value
        },
        listDirectory: (path, signal) => ui.remote.directoryPicker.list(path, signal),
        requestDraftInitialization: (binding: SessionBinding, options: DraftInitializationOptions): DraftInitializationResult => {
          const conversation = ui.get('conversation')
          if (conversation === undefined) return 'blocked'
          return conversation.input.requestDraftInitialization(binding, options)
        },
        startAttempt: (request: StartAttemptRequest) => notified(ui.remote.loom.startAttempt(request)),
        attachSession: (request: AttachSessionRequest) => notified(ui.remote.loom.attachSession(request)),
        registerTemporarySession: (request: RegisterTemporarySessionRequest) => notified(ui.remote.loom.registerTemporarySession(request)),
        listAgentPresets: () => ui.remote.agentPresets.list(),
        transitionTask: (request: TransitionTaskRequest) => notified(ui.remote.loom.transitionTask(request), 'notice.taskMoved'),
        workspaceChanges: (request: WorkspaceChangesRequest) => ui.remote.loom.workspaceChanges(request),
        readFile: (sessionId, path, offset, signal): Promise<RemoteResult<WorkspaceFileText>> => ui.remote.workspaceFiles.read(sessionId, path, { offset }, signal),
        cleanupWorkspace: (request: CleanupWorkspaceRequest) => notified(ui.remote.loom.cleanupWorkspace(request), 'notice.workspaceCleaned'),
        acquireExecution: (request: ExecutionRequest) => notified(ui.remote.loom.acquireExecution(request)),
        releaseExecution: (request: ReleaseExecutionRequest) => notified(ui.remote.loom.releaseExecution(request)),
        takeoverExecution: (request: ExecutionRequest) => notified(ui.remote.loom.takeoverExecution(request)),
        createSessionInWorkspace: async (path: string, agentPreset?: string) => {
          const workspace = await ui.workspaces.create({ path })
          return ui.sessions.create({ workspaceId: workspace.workspaceId, ...(agentPreset === undefined ? {} : { agentPreset }) })
        },
      }),
    }, LoomPanel))
    ui.slots.inject('shell.overlay', () => ui.slots.register({
      name: 'shell.overlay', id: 'loom-notice', locale: NS,
    }, LoomNoticeHost))
    const conversationViews = createSnapshotStore<readonly ViewTab[]>([])
    const refreshConversationViews = (): void => {
      conversationViews.set(ui.slots.entries('conversation.view').flatMap(entry => {
        const id = entry.options.id
        if (id === undefined) return []
        return [{ id, label: resolveSlotLabel(entry.options.label) ?? id }]
      }))
    }
    refreshConversationViews()
    ui.effect(() => {
      const disposeViews = ui.slots.subscribe('conversation.view', refreshConversationViews)
      const disposeLocale = ui.locale.subscribe(refreshConversationViews)
      return () => {
        disposeViews()
        disposeLocale()
      }
    }, 'loom: conversation views')
    ui.slots.inject('loom.conversation', () => ui.slots.register({
      name: 'loom.conversation',
      inject: () => ({ hooks: { conversationViews } }),
    }, ConversationEmbed))
    ui.slots.inject('sidebar.panellist', () => ui.slots.register({
      name: 'sidebar.panellist', id: PANEL_ID, order: 6, locale: NS, label: () => t('panel'),
    }, LoomSidebarIcon))
  })
}

/** Sidebar entry mark; the surrounding button owns active color. */
function LoomSidebarIcon({ size = 16 }: { readonly size?: number }) {
  return createElement(LoomMark, { size })
}
