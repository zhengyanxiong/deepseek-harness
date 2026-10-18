/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import type { ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import type { RenderFactorySlot } from '@deepseek-ai/dsh-client-ui-slots'
import type { ViewTab } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ConversationEmbed } from '../src/client/conversation/ConversationEmbed.tsx'

/** Minimal native view host contract used to record which view renders. */
interface ViewHostProps {
  renderSlot: (key: string, owner: { view?: string }) => null
}

const activeSession = {
  blank: false,
  awaitingFirstTurn: false,
  running: false,
  promptAttempted: true,
  openState: 'open',
}

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

/**
 * Mount the Loom conversation wrapper over native-shaped slot props.
 * @param tabs - registered native conversation views.
 * @returns The view owner recorded by each rendered native view.
 */
async function mount(tabs: readonly ViewTab[]): Promise<string[] | undefined> {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const rendered: string[] = []
  const renderFactorySlot: RenderFactorySlot = (_name, _input, options) => {
    const ViewHost = options?.slots?.views
    if (ViewHost === undefined) return null
    return createElement(ViewHost as ComponentType<ViewHostProps>, {
      renderSlot: (key, owner) => {
        if (key === 'conversation.session') rendered.push(owner.view ?? '')
        return null
      },
    })
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(ConversationEmbed, {
      sessionId: 's1',
      useSession: (selector: (value: unknown) => unknown) => selector(activeSession),
      useConversation: (selector: (value: unknown) => unknown) => selector({ activeTargets: new Set(['chat']) }),
      useSessions: (selector: (value: unknown) => unknown) => selector({ byId: { s1: { blank: false } } }),
      useConversationViews: (selector: (value: unknown) => unknown) => selector(tabs),
      renderFactorySlot,
    } as never))
  })
  return rendered
}

it('renders native view tabs and switches the factory to the selected view', async () => {
  const rendered = await mount([{ id: 'chat', label: '对话' }, { id: 'trajectory', label: '轨迹' }])
  const tablist = container?.querySelector('[data-loom-conversation-tabs]')
  expect(tablist?.getAttribute('role')).toBe('tablist')
  const buttons = [...(tablist?.querySelectorAll('button') ?? [])]
  expect(buttons.map(button => button.textContent)).toEqual(['对话', '轨迹'])
  expect(buttons[0]?.getAttribute('aria-selected')).toBe('true')
  expect(rendered.at(-1)).toBe('chat')

  await act(async () => {
    buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  expect(buttons[1]?.getAttribute('aria-selected')).toBe('true')
  expect(rendered.at(-1)).toBe('trajectory')
})

it('leaves chat-only native conversations without a tab strip', async () => {
  const rendered = await mount([{ id: 'chat', label: '对话' }])
  expect(container?.querySelector('[data-loom-conversation-tabs]')).toBeNull()
  expect(rendered.at(-1)).toBe('chat')
})
