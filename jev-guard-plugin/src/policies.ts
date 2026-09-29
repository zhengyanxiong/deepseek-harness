/**
 * 策略层：评估与决策分离（与 jev-guard/src/jevguard/policies.py 完全同构）。
 * Jev 只产出评估（概率 + severity）；这里的 route() 是纯函数，把评估映射为处置。
 * 换策略 = 换一组数字，概率本身不动。
 */

/** 危害 → 动作。block 直接拦截；review 转人工。 */
export const HAZARD_ACTION: Record<string, 'block' | 'review'> = {
  deletes_data: 'block',
  bypasses_safety: 'block',
  affects_system_scope: 'block',
  overwrites_data: 'review',
  hard_to_reverse: 'review',
}

/** 多个危害同时触发时，排在前面的动作获胜 */
export const PRECEDENCE = ['support', 'block', 'review', 'pass'] as const

export interface Policy {
  review_threshold: number
  action_threshold: number
  severity_block: number
}

/** 命名策略：阈值没有标准答案，从保守值起步，用自己的标注数据校准 */
export const POLICIES: Record<'strict' | 'permissive', Policy> = {
  strict:     { review_threshold: 0.35, action_threshold: 0.70, severity_block: 2.0 },
  permissive: { review_threshold: 0.35, action_threshold: 0.85, severity_block: 2.0 },
}

export type GateAction = 'pass' | 'review' | 'block'

/** 把一次评估映射为一个处置动作（纯函数：可单测、可缓存、可复现） */
export function route(nouls: Record<string, number>, severity: number, policy: Policy): GateAction {
  const triggered: string[] = []
  for (const hazard of Object.keys(nouls)) {
    const probability = nouls[hazard]
    if (probability >= policy.action_threshold) {
      triggered.push(HAZARD_ACTION[hazard] ?? 'review')
    } else if (probability >= policy.review_threshold) {
      triggered.push('review')
    }
  }
  if (severity >= policy.severity_block) {
    triggered.splice(0, triggered.length, ...triggered.map(a => a === 'review' ? 'block' : a))
  }
  for (const action of PRECEDENCE) {
    if (triggered.includes(action)) return action as GateAction
  }
  return 'pass'
}

/** 可解释性：哪些危害越线、severity 是否升级——写进 deny/ask 的 reason */
export function fireNote(nouls: Record<string, number>, severity: number, policy: Policy): string {
  const fired: string[] = []
  for (const hazard of Object.keys(nouls)) {
    const probability = nouls[hazard]
    if (probability >= policy.action_threshold) fired.push(`${hazard}=${probability.toFixed(2)}≥action→${HAZARD_ACTION[hazard]}`)
    else if (probability >= policy.review_threshold) fired.push(`${hazard}=${probability.toFixed(2)}≥review`)
  }
  if (severity >= policy.severity_block && fired.length > 0) fired.push(`severity=${severity.toFixed(2)} 升级 review→block`)
  return fired.length > 0 ? fired.join('；') : '无任何危害越线'
}
