/** Minimal Host event declarations for Loom's Agent gate and Session teardown listeners. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Decision shape returned by the native tool pre-execute waterfall. */
export type LoomToolDecision =
  | { readonly kind: 'deny'; readonly reason: string }
  | { readonly kind: 'ask'; readonly reason?: string | undefined }
  | { readonly kind: 'allow' }
  | { readonly kind: 'cancel' }
  | undefined

/** Agent runtime subset observed by the execution gate. */
export interface LoomAgent {
  readonly status: 'idle' | 'running'
  readonly session: { readonly id: Branded<'SessionId'> }
  cancel(cause: { readonly kind: 'user' }, options?: { readonly keepInbox?: boolean | undefined }): void
}

/** Live Agent registry subset used to stop an execution owner and its descendants. */
export interface LoomAgentRegistry {
  get(id: Branded<'SessionId'>): LoomAgent | undefined
  list?(): readonly LoomAgent[]
  isOwnedBy?(id: Branded<'SessionId'>, owner: LoomAgent): boolean
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** Native tool policy waterfall observed before any tool executes. */
    'tools/pre-execute'(exec: { readonly agent?: LoomAgent | undefined }, next: () => Promise<LoomToolDecision>): Promise<LoomToolDecision>
    /** Native Agent lifecycle transition; used to release finished execution owners. */
    'agent/status'(payload: { readonly agent: LoomAgent; readonly status: 'idle' | 'running' }): void
    /** Native Session disposal; used to release or dequeue its execution token. */
    'session/disposed'(session: { readonly id: Branded<'SessionId'> }): void
  }
}
