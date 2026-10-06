/**
 * Embedded native conversation seats (design §11): one component registered
 * into both `workbench.composer.conversation` and `workbench.drawer.conversation`.
 * It renders the host `conversation.content` factory slot through the
 * ui-subagent sidebar-chat architecture — an explicit SessionProvider binding
 * established by the panel, `variant: 'embedded'`, and a fixed chat view.
 *
 * - composer mode: message stream hidden (`views` overridden with a null
 *   component), phase pinned to 'active' — the seat is the native InputBar.
 * - drawer mode: full native conversation; phase derived like
 *   ui-subagent's ConversationSlotPanel (blank hero → settling → active).
 */

import type { GlobalStandardProps, PropsRenderFactories, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Owner share passed by the panel's renderSlot calls. */
export type EmbedMode = 'composer' | 'drawer'

/** Props for one embedded conversation seat. */
export type ConversationEmbedProps =
  & GlobalStandardProps
  & SessionStandardProps
  & PropsRenderFactories
  & { readonly mode: EmbedMode }

/** Fixed chat view: render the session's chat conversation view only. */
function FixedChatConversationView(props: ConversationViewsProps) {
  return <>{props.renderSlot('conversation.session', { view: 'chat' })}</>
}

/** Composer seat hides the message stream; the InputBar stays native. */
function NullViews() {
  return null
}

/** Render the composer seat: native InputBar only, no hero, no message stream. */
function ComposerEmbed({ renderFactorySlot }: ConversationEmbedProps) {
  return renderFactorySlot('conversation.content',
    { variant: 'embedded', phase: 'active', hero: false },
    { slots: { views: NullViews } })
}

/** Render the drawer seat: the full native conversation for the bound Session. */
function DrawerEmbed({ sessionId, useSession, useConversation, useSessions, renderFactorySlot }: ConversationEmbedProps) {
  const session = useSession(value => value)
  const conversation = useConversation(value => value)
  const active = conversation.activeTargets.size > 0
    || (!session.blank && !session.awaitingFirstTurn)
    || session.running
  const shellPhase = active ? 'active' : session.promptAttempted ? 'engaging' : 'blank'
  const summaryBlank = useSessions(state => state.byId[sessionId]?.blank)
  const settling = shellPhase === 'blank' && session.openState === 'loading' && summaryBlank !== true
  const hero = shellPhase === 'blank' && (session.openState === 'open' || summaryBlank === true)
  const phase = settling ? 'settling' : hero ? 'hero' : 'active'
  return renderFactorySlot('conversation.content',
    { variant: 'embedded', phase, hero },
    { slots: { views: FixedChatConversationView } })
}

/**
 * Render one embedded native conversation seat.
 * @param props - slot runtime props plus the panel-supplied mode share.
 * @returns the embedded conversation surface.
 */
export function ConversationEmbed(props: ConversationEmbedProps) {
  return props.mode === 'composer' ? <ComposerEmbed {...props} /> : <DrawerEmbed {...props} />
}
