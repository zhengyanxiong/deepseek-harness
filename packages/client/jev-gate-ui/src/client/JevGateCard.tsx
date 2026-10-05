/**
 * jev-gate 配置卡片（Settings → Plugins → Plugin configuration）。
 *
 * 独立绘制控件与暂存壳（bundle 纯净门禁止跨插件值引用 ui-settings-plugins
 * 的 PluginCard/fields），只用平台基线模块（react / dsh-client-store /
 * dsh-client-ui-slots），零额外模块请求。外观朴素但契约一致：暂存编辑、
 * 保存才写、覆盖徽标、恢复默认、保存失败保留草稿。
 */

import { type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only：keyed 插槽 'settings.plugin.item' 的 SlotMap 声明（宿主包提供，
// 类型在编译期擦除，运行时经 ctx.slots 服务协作）。
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { JevGateCardFace } from './controller.ts'
import type { JevGateLocaleKey } from './locales.ts'

/** 渲染器为卡片绑定的 props。 */
export type JevGateCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'jev-gate-ui'>
  & InjectFace<JevGateCardFace>

/** 一个字段的静态描述：渲染哪种控件、选项是什么。 */
interface FieldDescriptor {
  field: keyof JevGateCardFace['hooks']['jevGateCard'] extends never ? never : string
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

const rowStyle = { display: 'flex', flexDirection: 'column' as const, gap: 4, marginBottom: 12 }
const labelStyle = { fontSize: 13, fontWeight: 600 as const, display: 'flex', gap: 8, alignItems: 'center' as const }
const hintStyle = { fontSize: 12, opacity: 0.65 }
const badgeStyle = { fontSize: 11, fontWeight: 400 as const, opacity: 0.7, border: '1px solid currentColor', borderRadius: 4, padding: '0 6px' }
const resetStyle = { fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, textDecoration: 'underline' as const }
const buttonStyle = { fontSize: 13, padding: '6px 16px', borderRadius: 6, cursor: 'pointer' }

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

  const renderControl = (desc: FieldDescriptor): ReactNode => {
    const fieldState = state[desc.field as keyof typeof state] as { text: string; overridden: boolean; invalid: boolean }
    const onEdit = (text: string) => { props.edit(desc.field, text) }
    if (desc.kind === 'choice' || desc.kind === 'boolean') {
      const choices = desc.kind === 'boolean' ? ['true', 'false'] : desc.choices ?? []
      return (
        <select
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
      )
    }
    return (
      <input
        aria-label={t(desc.labelKey)}
        disabled={disabled}
        type={desc.kind === 'number' ? 'number' : 'text'}
        value={fieldState.text}
        onChange={event => onEdit(event.target.value)}
      />
    )
  }

  return (
    <li style={{ display: 'block', border: '1px solid rgba(128,128,128,0.25)', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{t('title')}</div>
        <div style={hintStyle}>{t('description')}</div>
      </div>
      {!state.writable ? <p role="status">{t('readOnly')}</p> : null}
      {FIELDS.map((desc) => {
        const fieldState = state[desc.field as keyof typeof state] as { text: string; overridden: boolean; invalid: boolean }
        return (
          <div key={desc.field} style={rowStyle}>
            <label style={labelStyle}>
              {t(desc.labelKey)}
              {fieldState.overridden ? <span style={badgeStyle}>{t('overridden')}</span> : null}
              {fieldState.invalid ? <span style={{ ...badgeStyle, color: '#c0392b' }}>{t('invalid')}</span> : null}
              <button type="button" style={resetStyle} disabled={disabled} onClick={() => { props.resetField(desc.field) }}>
                {t('reset')}
              </button>
            </label>
            {renderControl(desc)}
            {desc.hintKey !== undefined ? <div style={hintStyle}>{t(desc.hintKey)}</div> : null}
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', marginTop: 4 }}>
        {state.failed ? <span role="status" style={{ color: '#c0392b', fontSize: 12 }}>{t('saveFailed')}</span> : null}
        {state.dirty ? <span style={badgeStyle}>{t('unsaved')}</span> : null}
        <button
          type="button"
          style={{ ...buttonStyle, background: 'none', border: '1px solid rgba(128,128,128,0.4)' }}
          disabled={!state.dirty || state.saving}
          onClick={props.discard}
        >
          {t('discard')}
        </button>
        <button
          type="button"
          style={{ ...buttonStyle, border: 'none', opacity: blocked ? 0.5 : 1 }}
          disabled={blocked}
          onClick={props.save}
        >
          {t(state.saving ? 'saving' : 'save')}
        </button>
      </div>
    </li>
  )
}
