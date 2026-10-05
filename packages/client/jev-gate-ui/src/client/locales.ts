/**
 * jev-gate 配置页的 locale 字典（zh/en）。键集即类型。
 * formLabels() 产出 SettingsForm 外壳的文案（对齐 web-search 先例）。
 */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

export const zh = {
  title: 'jev-gate 安全门禁',
  description: 'Jev 评估 bash/pwsh 命令的危害概率，策略层把评估映射为放行 / 送审 / 拦截。',
  policy: '命名策略',
  policyHint: 'strict 保守 · permissive 宽松 · calibrated 2026-10-05 用 83 条真实日志定标',
  tools: '监控工具',
  toolsHint: '逗号分隔；这些工具的 command 参数会被评估',
  apiKeyEnv: 'API Key 凭证引用',
  apiKeyEnvHint: '经 ctx.credentials 解析；refs 层即 ~/.dsh/.credentials.yaml',
  model: '评估模型',
  modelHint: '钉死版本，不用 jev-latest',
  timeoutMs: '评估超时（毫秒）',
  onError: '评估失败处置',
  onErrorHint: 'allow 放行并记日志 · deny 全部拦截（fail-closed）',
  verbose: '终端留痕',
  verboseHint: '每次评估在实例终端输出一行完整 nouls 摘要（含放行）',
  traceNote: '轨迹注记',
  traceNoteHint: '把放行的评估画像以 notice 折叠行写进会话轨迹',
  save: '保存',
  saving: '保存中…',
  overridden: '已覆盖',
  reset: '恢复默认',
  invalid: '不是有效值',
  saveFailed: '保存失败，请修正后重试',
  readOnly: '当前为只读，无法保存',
  unavailable: '宿主未提供 jev-gate 配置段',
} as const

export const en: Record<keyof typeof zh, string> = {
  title: 'jev-gate safety gate',
  description: 'Jev scores bash/pwsh commands for hazards; the policy layer maps scores to pass / review / block.',
  policy: 'Named policy',
  policyHint: 'strict conservative · permissive lax · calibrated on 83 real commands (2026-10-05)',
  tools: 'Watched tools',
  toolsHint: 'Comma-separated; the command argument of these tools is assessed',
  apiKeyEnv: 'API key credential reference',
  apiKeyEnvHint: 'Resolved via ctx.credentials; the refs layer is ~/.dsh/.credentials.yaml',
  model: 'Assessment model',
  modelHint: 'Pin the version; do not track jev-latest',
  timeoutMs: 'Assessment timeout (ms)',
  onError: 'On assessment failure',
  onErrorHint: 'allow passes with a log line · deny blocks everything (fail-closed)',
  verbose: 'Terminal trace',
  verboseHint: 'One full nouls summary line per assessment in the instance terminal (incl. pass)',
  traceNote: 'Trace note',
  traceNoteHint: 'Write the pass assessment profile into the session trace as a collapsible notice',
  save: 'Save',
  saving: 'Saving…',
  overridden: 'overridden',
  reset: 'Reset',
  invalid: 'invalid value',
  saveFailed: 'Save failed; fix and retry',
  readOnly: 'Read-only; cannot save',
  unavailable: 'The Host does not serve the jev-gate namespace',
}

export type JevGateLocaleKey = keyof typeof zh

/**
 * Build the SettingsForm frame's copy.
 * @param t - the bound dictionary lookup for this plugin's namespace.
 * @returns the labels the form chrome renders.
 */
export function formLabels(t: (key: JevGateLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** jev-gate 配置页文案。 */
    'jev-gate-ui': JevGateLocaleKey
  }
}
