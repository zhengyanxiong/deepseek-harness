/** Native conversation factory wrapper used by Loom's session workspace seat. */
import type { GlobalStandardProps, PropsRenderFactories, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Props supplied by the session-scoped Loom conversation slot. */
export type ConversationEmbedProps = GlobalStandardProps & SessionStandardProps & PropsRenderFactories

/** Keep Loom on the native chat view while preserving the complete conversation UI. */
function ChatView(props: ConversationViewsProps) {
  return <>{props.renderSlot('conversation.session', { view: 'chat' })}</>
}

/**
 * Render the full native conversation for the Session retained by Loom.
 * @param props - Session-scoped slot props and factory renderer.
 * @returns The native embedded conversation surface.
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
  return renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero }, { slots: { views: ChatView } })
}
