/**
 * jev-gate 配置卡片（Settings → Plugins → Plugin configuration）。
 *
 * 独立绘制控件与暂存壳（bundle 纯净门禁止跨插件值引用 ui-settings-plugins
 * 的 PluginCard/fields），只用平台基线模块（react / dsh-client-store /
 * dsh-client-ui-slots），零额外模块请求。样式走 dsw-alias-* 设计令牌
 * （CSS Modules，构建期 lightningcss 编译注入），亮暗主题随宿主。
 */

import { type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only：keyed 插槽 'settings.plugin.item' 的 SlotMap 声明（宿主包提供，
// 类型在编译期擦除，运行时经 ctx.slots 服务协作）。
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { JevGateCardFace } from './controller.ts'
import type { JevGateLocaleKey } from './locales.ts'
import css from './JevGateCard.module.css'

/** 渲染器为卡片绑定的 props。 */
export type JevGateCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'jev-gate-ui'>
  & InjectFace<JevGateCardFace>

/** 一个字段的静态描述：渲染哪种控件、选项是什么。 */
interface FieldDescriptor {
  field: string
  labelKey: JevGateLocaleKey
  hintKey?: JevGateLocaleKey
  kind: 'text' | 'number' | 'choice' | 'boolean'
  choices?: readonly string[]
}

const FIELDS: readonly FieldDescriptor[] = [
  { field: 'policy', labelKey: 'policy', hintKey: 'policyHint', kind: 'choice', choices: ['strict', 'permissive', 'calibrated'] },
  { field: 'tools', labelKey: 'tools', hintKey: 'toolsHint', kind: 'text' },
  { field: 'apiKeyEnv', labelKey: 'apiKeyEnv', hintKey: 'apiKeyEnvHint', kind: 'text' },
  { field: 'model', labelKey: 'model', kind: 'text' },
  { field: 'timeoutMs', labelKey: 'timeoutMs', kind: 'number' },
  { field: 'onError', labelKey: 'onError', kind: 'choice', choices: ['allow', 'deny'] },
  { field: 'verbose', labelKey: 'verbose', hintKey: 'verboseHint', kind: 'boolean' },
  { field: 'traceNote', labelKey: 'traceNote', hintKey: 'traceNoteHint', kind: 'boolean' },
]

type FieldState = { text: string; overridden: boolean; invalid: boolean }

/**
 * 渲染 jev-gate 卡片。
 * @param props - locale 文案、卡片快照与表单动作。
 * @returns 卡片；namespace 不可用时渲染为空（宿主未组合该插件时不留痕迹）。
 */
export function JevGateCard(props: JevGateCardProps) {
  const { t } = props
  const state = props.useJevGateCard(snapshot => snapshot)
  if (!state.available) return null
  const disabled = !state.writable
  const blocked = !state.dirty || state.invalid || state.saving

  const fieldStateOf = (field: string): FieldState =>
    state[field as keyof typeof state] as unknown as FieldState

  const renderControl = (desc: FieldDescriptor): ReactNode => {
    const fieldState = fieldStateOf(desc.field)
    const onEdit = (text: string) => { props.edit(desc.field, text) }
    if (desc.kind === 'choice' || desc.kind === 'boolean') {
      const choices = desc.kind === 'boolean' ? ['true', 'false'] : desc.choices ?? []
      return (
        <div className={css.selectWrap}>
          <select
            className={css.select}
            aria-label={t(desc.labelKey)}
            disabled={disabled}
            value={fieldState.text}
            onChange={event => onEdit(event.target.value)}
          >
            {fieldState.text === '' ? <option value="">（{t('reset')}）</option> : null}
            {choices.map(choice => (
              <option key={choice} value={choice}>
                {desc.kind === 'boolean' ? t(choice === 'true' ? 'on' : 'off') : choice}
              </option>
            ))}
          </select>
          <span className={css.chevron} aria-hidden="true">▾</span>
        </div>
      )
    }
    return (
      <input
        className={css.control}
        aria-label={t(desc.labelKey)}
        disabled={disabled}
        type={desc.kind === 'number' ? 'number' : 'text'}
        value={fieldState.text}
        onChange={event => onEdit(event.target.value)}
      />
    )
  }

  return (
    <li className={css.card}>
      <div className={css.head}>
        <div className={css.name}>{t('title')}</div>
        <div className={css.description}>{t('description')}</div>
      </div>
      {!state.writable ? <p className={css.readOnly} role="status">{t('readOnly')}</p> : null}
      <div className={css.body}>
        {FIELDS.map((desc) => {
          const fieldState = fieldStateOf(desc.field)
          return (
            <div key={desc.field} className={css.field}>
              <div className={css.labelRow}>
                <span>{t(desc.labelKey)}</span>
                {fieldState.overridden ? <span className={css.badge}>{t('overridden')}</span> : null}
                {fieldState.invalid ? <span className={`${css.badge} ${css.badgeInvalid}`}>{t('invalid')}</span> : null}
                <button type="button" className={css.reset} disabled={disabled} onClick={() => { props.resetField(desc.field) }}>
                  {t('reset')}
                </button>
              </div>
              {renderControl(desc)}
              {desc.hintKey !== undefined ? <div className={css.hint}>{t(desc.hintKey)}</div> : null}
            </div>
          )
        })}
      </div>
      <div className={css.footer}>
        {state.failed ? <p className={css.failed} role="status">{t('saveFailed')}</p> : null}
        {state.dirty ? <span className={css.badge}>{t('unsaved')}</span> : null}
        <button
          type="button"
          className={css.discard}
          disabled={!state.dirty || state.saving}
          onClick={props.discard}
        >
          {t('discard')}
        </button>
        <button
          type="button"
          className={css.save}
          disabled={blocked}
          onClick={props.save}
        >
          {t(state.saving ? 'saving' : 'save')}
        </button>
      </div>
    </li>
  )
}
