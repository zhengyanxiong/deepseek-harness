/** Native conversation factory wrapper used by Loom's session workspace seat. */
import { createContext, useContext, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { GlobalStandardProps, InjectFace, PropsRenderFactories, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationViewsProps, ViewTab } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { COLORS } from '../shell.ts'

/** View roster supplied by the Loom conversation registration. */
interface ConversationEmbedInjected {
  readonly hooks: {
    /** Registered native conversation views, with their localized labels. */
    readonly conversationViews: ObservableSnapshot<readonly ViewTab[]>
  }
}

/** Props supplied by the session-scoped Loom conversation slot. */
export type ConversationEmbedProps =
  GlobalStandardProps
  & SessionStandardProps
  & PropsRenderFactories
  & InjectFace<ConversationEmbedInjected>

/** Selected view identity read by the factory's view host. */
const ViewIdContext = createContext<string | undefined>(undefined)

/** Fallback view identity when the Chat view is registered. */
const DEFAULT_VIEW_ID = 'chat'

/**
 * Render the native view selected by Loom's tab strip.
 * @param props - Native conversation view render share.
 * @returns The active native conversation view.
 */
function NativeViewHost(props: ConversationViewsProps) {
  const view = useContext(ViewIdContext)
  return <>{props.renderSlot('conversation.session', view === undefined ? {} : { view })}</>
}

const tabsStyle: CSSProperties = {
  display: 'flex',
  gap: 36,
  padding: '10px 16px 0',
  borderBottom: `0.5px solid ${COLORS.border}`,
  flex: 'none',
}

const tabStyle: CSSProperties = {
  padding: '0 0 9px',
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  fontSize: 13,
  lineHeight: '16px',
  fontWeight: 500,
  color: COLORS.faint,
  cursor: 'pointer',
}

/**
 * Render the full native conversation for the Session retained by Loom, including
 * native view tabs when more than one view is registered.
 * @param props - Session-scoped slot props, factory renderer, and view roster.
 * @returns The native embedded conversation surface.
 */
export function ConversationEmbed({
  sessionId, useSession, useConversation, useSessions, useConversationViews, renderFactorySlot,
}: ConversationEmbedProps) {
  const session = useSession(value => value)
  const conversation = useConversation(value => value)
  const tabs = useConversationViews(value => value)
  const [preferredView, setPreferredView] = useState<string | null>(null)
  const active = conversation.activeTargets.size > 0
    || (!session.blank && !session.awaitingFirstTurn)
    || session.running
  const shellPhase = active ? 'active' : session.promptAttempted ? 'engaging' : 'blank'
  const summaryBlank = useSessions(state => state.byId[sessionId]?.blank)
  const settling = shellPhase === 'blank' && session.openState === 'loading' && summaryBlank !== true
  const hero = shellPhase === 'blank' && (session.openState === 'open' || summaryBlank === true)
  const phase = settling ? 'settling' : hero ? 'hero' : 'active'
  const activeView = (preferredView === null ? undefined : tabs.find(tab => tab.id === preferredView))
    ?? tabs.find(tab => tab.id === DEFAULT_VIEW_ID)
    ?? tabs[0]
  return (
    <>
      {phase === 'active' && tabs.length > 1 && (
        <div style={tabsStyle} role="tablist" data-loom-conversation-tabs="">
          {tabs.map(tab => {
            const selected = tab.id === activeView?.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                style={{ ...tabStyle, ...(selected ? { color: COLORS.business, boxShadow: `inset 0 -2px 0 ${COLORS.business}` } : {}) }}
                onClick={() => { setPreferredView(tab.id) }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      )}
      <ViewIdContext.Provider value={activeView?.id}>
        {renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero }, { slots: { views: NativeViewHost } })}
      </ViewIdContext.Provider>
    </>
  )
}
