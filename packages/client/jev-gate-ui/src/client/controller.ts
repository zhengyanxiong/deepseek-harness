/**
 * jev-gate 配置页的分段表单模型（staged form），复刻 ui-settings-web-search
 * 伴侣包的写法：SettingsFormModel 托管草稿/保存/丢弃与 revision 栅栏，
 * 平台基元组件渲染。本文件只补平台没有的三种字段规格：
 * 逗号分隔的字符串数组（tools）、布尔（verbose/traceNote）；
 * 枚举字段（policy/onError）语义与文本字段一致（非空即 set），
 * 合法性由保存时 Host schema 校验兜底，hint 文案列出可选值。
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsFormModel, settingsNumberField, settingsTextField,
  type SettingsFieldSpec, type SettingsFieldState, type SettingsFormActions, type SettingsFormShell, type SettingsFormScope,
} from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * 宿主 jev-gate 插件在 Loader 上的 entry id（join key）。
 * Client 包不得依赖 Host 包，namespace 逐字拼写（对齐 WEB_SEARCH_NS 先例）。
 */
export const JEV_GATE_NS = 'jev-gate'

/** The jev-gate fields this page edits（wire section 的形状）。 */
export interface JevGateSettings {
  /** 命名策略：strict | permissive | calibrated。 */
  policy?: string
  /** 监控工具名列表；bash/pwsh 的 command 参数会被评估。 */
  tools?: string[]
  /** TypeSafe API Key 的凭证引用名。 */
  apiKeyEnv?: string
  /** 钉死的评估模型版本。 */
  model?: string
  /** 评估请求超时（毫秒）。 */
  timeoutMs?: number
  /** 评估失败处置：allow | deny。 */
  onError?: string
  /** 每次评估在实例终端留一行完整 nouls 摘要。 */
  verbose?: boolean
  /** 把放行的评估画像以 notice 折叠行写进会话轨迹。 */
  traceNote?: boolean
}

/** What the jev-gate page renders。 */
export interface JevGateCardState extends SettingsFormShell {
  policy: SettingsFieldState
  tools: SettingsFieldState
  apiKeyEnv: SettingsFieldState
  model: SettingsFieldState
  timeoutMs: SettingsFieldState
  onError: SettingsFieldState
  verbose: SettingsFieldState
  traceNote: SettingsFieldState
}

/** The registration-side face the page's slot entry injects。 */
export interface JevGateCardFace extends SettingsFormActions {
  hooks: {
    /** Page snapshot bound by the renderer as useJevGateCard. */
    jevGateCard: SnapshotStore<JevGateCardState>
  }
}

/**
 * 逗号分隔的字符串数组字段。空草稿清除；逐段 trim、去空。
 * @param field - field name inside the namespace section.
 * @returns the field's conversion spec.
 */
function settingsStringListField(field: string): SettingsFieldSpec {
  return {
    field,
    format: value => Array.isArray(value) ? value.join(', ') : '',
    parse: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return { kind: 'clear' }
      return { kind: 'set', value: trimmed.split(',').map(part => part.trim()).filter(part => part !== '') }
    },
  }
}

/**
 * 布尔字段。草稿 'true'/'false' 映射为布尔；空草稿清除；
 * 其他文本不是该字段接受的值——阻塞保存而不是静默改写。
 * @param field - field name inside the namespace section.
 * @returns the field's conversion spec.
 */
function settingsBooleanField(field: string): SettingsFieldSpec {
  return {
    field,
    format: value => typeof value === 'boolean' ? String(value) : '',
    parse: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return { kind: 'clear' }
      if (trimmed === 'true') return { kind: 'set', value: true }
      if (trimmed === 'false') return { kind: 'set', value: false }
      return undefined
    },
  }
}

/** Bridges the `jev-gate` namespace onto the Plugins page entry. */
export class JevGateCardController {
  private readonly form: SettingsFormModel<JevGateSettings>
  private readonly store: SnapshotStore<JevGateCardState>

  /**
   * @param scope - the shared configuration form for the `jev-gate` namespace.
   */
  constructor(scope: SettingsFormScope<JevGateSettings>) {
    this.form = new SettingsFormModel(scope, [
      settingsTextField('policy'),
      settingsStringListField('tools'),
      settingsTextField('apiKeyEnv'),
      settingsTextField('model'),
      settingsNumberField('timeoutMs'),
      settingsTextField('onError'),
      settingsBooleanField('verbose'),
      settingsBooleanField('traceNote'),
    ])
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): JevGateCardState {
    return {
      ...this.form.shell(),
      policy: this.form.field('policy'),
      tools: this.form.field('tools'),
      apiKeyEnv: this.form.field('apiKeyEnv'),
      model: this.form.field('model'),
      timeoutMs: this.form.field('timeoutMs'),
      onError: this.form.field('onError'),
      verbose: this.form.field('verbose'),
      traceNote: this.form.field('traceNote'),
    }
  }

  /**
   * Build the face the page's slot registration injects.
   * @returns the page's snapshot and its form actions.
   */
  inject(): JevGateCardFace {
    return { hooks: { jevGateCard: this.store }, ...this.form.actions() }
  }

  /** Release configuration subscriptions. */
  dispose(): void { this.form.dispose() }
}
