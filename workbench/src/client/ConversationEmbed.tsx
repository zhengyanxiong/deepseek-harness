/**
 * Embedded native conversation seat (design §11): the panel registers this
 * component into `workbench.drawer.conversation`. It renders the host
 * `conversation.content` factory slot through the ui-subagent sidebar-chat
 * architecture — an explicit SessionProvider binding established by the
 * panel, `variant: 'embedded'`, and a fixed chat view. The phase derives
 * like ui-subagent's ConversationSlotPanel (blank hero → settling → active).
 */

import type { GlobalStandardProps, PropsRenderFactories, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Props for the embedded drawer conversation seat. */
export type ConversationEmbedProps =
  & GlobalStandardProps
  & SessionStandardProps
  & PropsRenderFactories

/** Fixed chat view: render the session's chat conversation view only. */
function FixedChatConversationView(props: ConversationViewsProps) {
  return <>{props.renderSlot('conversation.session', { view: 'chat' })}</>
}

/**
 * Render the drawer seat: the full native conversation for the bound Session.
 * @param props - slot runtime props bound to the drawer's SessionProvider.
 * @returns the embedded conversation surface.
 */
export function ConversationEmbed({ sessionId, useSession, useConversation, useSessions, renderFactorySlot }: ConversationEmbedProps) {
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
