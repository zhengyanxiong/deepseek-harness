/**
 * jev-gate 配置卡片（Settings → Plugins → Plugin configuration）。
 *
 * 独立绘制控件与暂存壳（bundle 纯净门禁止跨插件值引用 ui-settings-plugins
 * 的 PluginCard/fields），只用平台基线模块（react / dsh-client-store /
 * dsh-client-ui-slots），零额外模块请求。样式走 dsw-alias-* 设计令牌
 * （CSS Modules，构建期 lightningcss 编译注入），亮暗主题随宿主。
 * 交互对齐官方卡片：默认收起、点标题展开、保存成功自动折叠、
 * 未保存徽标带在标题行（收着也能看见）。
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
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
 * 折叠箭头（SVG，不依赖页面字体对 ▾ 字形的支持）。
 */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`${css.chevron} ${open ? css.chevronOpen : ''}`}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * 渲染 jev-gate 卡片。
 * @param props - locale 文案、卡片快照与表单动作。
 * @returns 卡片；namespace 不可用时渲染为空（宿主未组合该插件时不留痕迹）。
 */
export function JevGateCard(props: JevGateCardProps) {
  const { t } = props
  const state = props.useJevGateCard(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const saveStarted = useRef(false)
  const disabled = !state.writable
  const blocked = !state.dirty || state.invalid || state.saving

  // 仅在 Host 确认落定后折叠：被拒的写保留诊断与草稿供修正。
  useEffect(() => {
    if (state.saving) {
      saveStarted.current = true
      return
    }
    if (!saveStarted.current) return
    saveStarted.current = false
    if (!state.dirty && !state.failed) setOpen(false)
  }, [state.dirty, state.failed, state.saving])

  if (!state.available) return null

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
    <li className={`${css.card} ${open ? css.cardOpen : ''}`}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${t('title')}`}
        onClick={() => { setOpen(!open) }}
      >
        <span className={css.headText}>
          <span className={css.name}>{t('title')}</span>
          <span className={css.description}>{t('description')}</span>
        </span>
        {state.dirty ? <span className={css.pending}>{t('unsaved')}</span> : null}
        <ChevronIcon open={open} />
      </button>
      {open
        ? (
          <div className={css.body}>
            {!state.writable ? <p className={css.readOnly} role="status">{t('readOnly')}</p> : null}
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
            <div className={css.footer}>
              {state.failed ? <p className={css.failed} role="status">{t('saveFailed')}</p> : null}
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
          </div>
        )
        : null}
    </li>
  )
}
