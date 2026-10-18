/** Loom main panel registration and native Session retention actions. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import contribution from 'dsh-loom/remote'
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
}
declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { loom: unknown }
}

/** Services needed by the native session browser and panel registration. */
export const inject = ['slots', 'locale', 'sessions', 'remote']

/** Register an isolated Loom page without changing the current panel selection.
 * @param ctx - Client registration context.
 */
export function apply(ctx: ClientContext): void {
  // Mount the generated namespace so panels can call `ctx.remote.loom` endpoints.
  let mounted: Promise<void> = Promise.resolve()
  ctx.effect(() => {
    const mounting = ctx.remote.$mount(contribution)
    mounted = mounting.then(() => undefined)
    return async () => { await (await mounting)() }
  }, 'loom: remote namespace')
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'loom: dictionary')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, locale: NS,
    children: { 'loom.conversation': { kind: 'single', scope: 'session' } },
    inject: (): LoomInjected => ({
      retainSession: id => ctx.sessions.retain(id, { source: 'loom' }),
      loadSnapshot: async () => {
        await mounted
        return ctx.remote.loom.snapshot()
      },
    }),
  }, LoomPanel))
  ctx.slots.inject('loom.conversation', () => ctx.slots.register({ name: 'loom.conversation' }, ConversationEmbed))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 6, locale: NS, label: () => t('panel'),
  }, LoomSidebarIcon))
}

/** Text-only sidebar mark until Loom artwork is approved. */
function LoomSidebarIcon() {
  return 'L'
}
