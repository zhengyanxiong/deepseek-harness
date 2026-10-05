/**
 * jev-gate 卡片控制器：`jev-gate` settings namespace 上的暂存表单桥。
 * namespace 字面量在此拼写（客户端包不得依赖 Host 包）——与 gate.ts 的
 * JEV_GATE_NS 同值，靠 settings 子系统的 join key 配对。
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  CardForm, booleanField, choiceField, listField, numberField, textField,
  type CardActions, type CardFieldState, type CardShell,
} from './form.ts'

/** settings namespace（join key：settings.yaml 里的段名）。 */
export const JEV_GATE_NS = 'jev-gate'

/** 这张卡片编辑的 jev-gate 字段（served schema 的子集，刻意）。 */
export interface JevGateSettings {
  policy?: string
  tools?: string[]
  apiKeyEnv?: string
  model?: string
  timeoutMs?: number
  onError?: string
  verbose?: boolean
  traceNote?: boolean
}

/** 卡片渲染状态。 */
export interface JevGateCardState extends CardShell {
  policy: CardFieldState
  tools: CardFieldState
  apiKeyEnv: CardFieldState
  model: CardFieldState
  timeoutMs: CardFieldState
  onError: CardFieldState
  verbose: CardFieldState
  traceNote: CardFieldState
}

/** 槽位注册注入面。 */
export interface JevGateCardFace extends CardActions {
  hooks: {
    /** 渲染器绑定为 useJevGateCard。 */
    jevGateCard: SnapshotStore<JevGateCardState>
  }
}

/** 桥接 `jev-gate` scope 到卡片暂存表单。 */
export class JevGateCardController {
  private readonly form: CardForm<JevGateSettings>
  private readonly store: SnapshotStore<JevGateCardState>

  constructor(scope: SettingsScope<JevGateSettings>) {
    this.form = new CardForm(scope, [
      choiceField('policy', ['strict', 'permissive', 'calibrated']),
      listField('tools'),
      textField('apiKeyEnv'),
      textField('model'),
      numberField('timeoutMs'),
      choiceField('onError', ['allow', 'deny']),
      booleanField('verbose'),
      booleanField('traceNote'),
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

  /** 槽位注册的 inject 面：快照 + 表单动作。 */
  inject(): JevGateCardFace {
    return { hooks: { jevGateCard: this.store }, ...this.form.actions() }
  }
}
