/**
 * jev-gate 配置页：bundle 详情页的一项——page 视图给分段表单
 * （SettingsForm 外壳 + SettingsValueField 控件，平台基元渲染，
 * 样式与官方插件配置页完全一致，无自绘 CSS）。
 */

// Type-only: the Plugins page's SlotMap merge (the 'plugins.bundle.config' entry).
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { SettingsForm, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { formLabels } from './locales.ts'
import type { JevGateLocaleKey } from './locales.ts'
import type { JevGateCardFace, JevGateCardState } from './controller.ts'

/** Props the renderer binds for the jev-gate page. */
export type JevGateCardProps =
  PropsRuntime<'plugins.bundle.config'>
  & PropsLocale<'jev-gate-ui'>
  & InjectFace<JevGateCardFace>

/** One field's static description: which label/hint keys and keypad hint. */
interface FieldDescriptor {
  field: keyof JevGateCardState & ('policy' | 'tools' | 'apiKeyEnv' | 'model' | 'timeoutMs' | 'onError' | 'verbose' | 'traceNote')
  labelKey: JevGateLocaleKey
  hintKey?: JevGateLocaleKey
  numeric?: boolean
}

const FIELDS: readonly FieldDescriptor[] = [
  { field: 'policy', labelKey: 'policy', hintKey: 'policyHint' },
  { field: 'tools', labelKey: 'tools', hintKey: 'toolsHint' },
  { field: 'apiKeyEnv', labelKey: 'apiKeyEnv', hintKey: 'apiKeyEnvHint' },
  { field: 'model', labelKey: 'model', hintKey: 'modelHint' },
  { field: 'timeoutMs', labelKey: 'timeoutMs', numeric: true },
  { field: 'onError', labelKey: 'onError', hintKey: 'onErrorHint' },
  { field: 'verbose', labelKey: 'verbose', hintKey: 'verboseHint' },
  { field: 'traceNote', labelKey: 'traceNote', hintKey: 'traceNoteHint' },
]

/**
 * Render the jev-gate one-liner or its settings form, as the Plugins page asks.
 * @param props - the view asked for, locale copy, the form snapshot, and its actions.
 * @returns the one-liner, or the form.
 */
export function JevGateCard(props: JevGateCardProps) {
  const { t } = props
  const state = props.useJevGateCard(snapshot => snapshot)
  if (props.view === 'summary') return t('description')
  const disabled = !state.writable
  return (
    <SettingsForm labels={formLabels(t)} state={state} onSave={props.save} onDiscard={props.discard}>
      {FIELDS.map(desc => (
        <SettingsValueField
          key={desc.field}
          id={`plugin-config-jev-gate-${desc.field}`}
          label={t(desc.labelKey)}
          {...desc.hintKey !== undefined ? { hint: t(desc.hintKey) } : {}}
          overriddenLabel={t('overridden')}
          resetLabel={t('reset')}
          invalidLabel={t('invalid')}
          {...desc.numeric === true ? { numeric: true } : {}}
          disabled={disabled}
          {...state[desc.field]}
          onEdit={(text) => { props.edit(desc.field, text) }}
          onReset={() => { props.resetField(desc.field) }}
        />
      ))}
    </SettingsForm>
  )
}
