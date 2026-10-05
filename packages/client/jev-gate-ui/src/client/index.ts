/**
 * jev-gate-ui 浏览器半：把 jev-gate 的配置卡片注册进
 * Settings → Plugins → Plugin configuration（key = settings namespace）。
 *
 * Host 半（gate.ts）注册同名 namespace 后，tab 自动把两半配成对——
 * 本包不解释 namespace 的含义，tab 也不认识这张卡片。
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only：ctx.slots 的 Context 合并（ui-slots 包 src 侧声明；官方包经
// 值引用带入，本包纯净门约束下用类型引用达到同效）。
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only：ctx.locale / ctx.settingsScope 的 Context 合并（服务经 cordis
// 注入，值引用只碰平台基线模块）。
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only：ctx.slots 的 Context 合并不在 ui-slots（那里只有 SlotMap），
// 而在 ui-renderer 的 client 半——官方卡片包同款引用。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { JevGateCard } from './JevGateCard.tsx'
import { JEV_GATE_NS, JevGateCardController } from './controller.ts'
import { en, zh } from './locales.ts'

/** 本卡片 fiber 需要的服务。 */
export const inject = ['slots', 'locale', 'settingsScope']

const NS = 'jev-gate-ui'

/**
 * 挂载卡片：注册 locale 字典 + 把卡片注册进 keyed 插槽。
 * @param ctx - 浏览器插件上下文。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'jev-gate-ui: dictionaries')

  const card = new JevGateCardController(ctx.settingsScope.bind({ namespace: JEV_GATE_NS }))
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: JEV_GATE_NS,
    locale: NS,
    inject: () => card.inject(),
  }, JevGateCard))
}
