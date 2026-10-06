/**
 * jev-gate 配置页，浏览器半面：在 Plugins 页注册 'plugins.item' 条目
 * （id: jev-gate）。注册不走 whileServed 门控：模块已加载、但宿主未服务
 * jev-gate 配置段时（如宿主加载失败），卡片仍保留并显示「宿主未提供配置段」，
 * 便于诊断。注意平台语义边界：宿主被开关停用时 client 伴侣随宿主包一起卸载，
 * 注册代码根本不会运行，卡片整条消失——重新启用需手改
 * ~/.dsh/profiles/web/cordis.patch.yml 删除该插件的 disabled: true
 * （HMR 会热应用，无需重启实例）。
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
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'jev-gate-ui: dictionaries')
  const card = new JevGateCardController(ctx.configForms.get(JEV_GATE_NS))
  ctx.effect(() => () => { card.dispose() }, 'jev-gate-ui: form subscription')
  // bundle 化后的单卡片架构（slot 契约明示：bundle 的配置属于 plugins.bundle.config，
  // 不占 plugins.item）：listBundles 驱动 bundle 卡片常驻（开关=manifest bundles 选择，
  // 双向热生效），本注册把配置表单挂到 bundle 详情页（点卡片进入）。
  // 宿主被开关停用则本模块随包卸载、表单缺席，卡片与开关仍在（与官方 bundle 一致）。
  ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: 'jev-gate',
    locale: NS,
    inject: () => card.inject(),
  }, JevGateCard)), 'jev-gate-ui: page')
}
