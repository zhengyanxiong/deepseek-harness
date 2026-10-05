/**
 * jev-gate 配置页，浏览器半面：在 Plugins 页注册 'plugins.item' 条目
 * （id: jev-gate），仅在宿主提供 jev-gate 命名空间时存在
 * （configForms.whileServed）——宿主未组合该插件时页面不留痕迹。
 * 写法对齐 ui-settings-web-search 伴侣包（新 master 的 plugins.item 契约）。
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.configForms Context merge. Cross-plugin collaboration
// goes through the service, never a value import (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the Plugins page's SlotMap merge (the 'plugins.item' entry).
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { JevGateCard } from './JevGateCard.tsx'
import { JEV_GATE_NS, JevGateCardController } from './controller.ts'
import { en, zh, type JevGateLocaleKey } from './locales.ts'

export type { JevGateCardProps } from './JevGateCard.tsx'
export type { JevGateCardFace, JevGateCardState, JevGateSettings } from './controller.ts'
export type { JevGateLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** jev-gate settings page copy. */
    'jev-gate-ui': JevGateLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'jev-gate-ui'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'configForms']

/**
 * Mount the jev-gate settings page while the Host serves its namespace.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'jev-gate-ui: dictionaries')
  const card = new JevGateCardController(ctx.configForms.get(JEV_GATE_NS))
  ctx.effect(() => () => { card.dispose() }, 'jev-gate-ui: form subscription')
  ctx.effect(() => ctx.configForms.whileServed([JEV_GATE_NS], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
    name: 'plugins.item',
    id: 'jev-gate',
    order: 40,
    label: () => t('title'),
    locale: NS,
    inject: () => card.inject(),
  }, JevGateCard))), 'jev-gate-ui: page')
}
