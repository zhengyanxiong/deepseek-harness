/**
 * jev-gate：DeepSeek Harness 插件——把 Jev 安全门禁挂在 `tools/pre-execute` 上。
 *
 * 对应扩展点语义（docs/cookbook/extension-cookbook.md）：
 * - `allow` → next()，执行调用
 * - `deny`  → 本次调用以错误收场（block 场景）
 * - `ask`   → 经审批服务放行后才执行（review 场景）
 *
 * 设计纪律：本插件只收窄（deny/ask），从不放宽。评估失败默认放行但记日志
 * （onError: 'allow'），网络故障不应把开发工作完全锁死；追求强保证时切 'deny'。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

import { PINNED_MODEL, screenCommand } from './jev.ts'
import { POLICIES, fireNote, route } from './policies.ts'

export const name = 'jev-gate'
export const inject = ['tools']

export interface Config {
  /** 命名策略：strict | permissive（POLICIES 的键） */
  policy?: string
  /** 要监控的工具名；bash/pwsh 的命令在 arguments.command */
  tools?: string[]
  /** 存放 TypeSafe API Key 的环境变量名 */
  apiKeyEnv?: string
  /** 钉死版本，不用 jev-latest */
  model?: string
  /** 评估请求超时 */
  timeoutMs?: number
  /** 评估失败时的处置：allow（放行+日志）| deny（fail-closed） */
  onError?: 'allow' | 'deny'
}

export const Config: z<Config> = z.object({
  policy: z.string().default('strict'),
  tools: z.array(z.string()).default(['bash', 'pwsh']),
  apiKeyEnv: z.string().default('TYPESAFE_API_KEY'),
  model: z.string().default(PINNED_MODEL),
  timeoutMs: z.number().default(8000),
  onError: z.union(['allow', 'deny'] as const).default('allow'),
})

export function apply(ctx: Context, config: Config): void {
  const policy = POLICIES[config.policy ?? 'strict'] ?? POLICIES.strict
  const watched = new Set(config.tools ?? ['bash', 'pwsh'])
  const apiKeyEnv = config.apiKeyEnv ?? 'TYPESAFE_API_KEY'
  const model = config.model ?? PINNED_MODEL
  const timeoutMs = config.timeoutMs ?? 8000
  const onError = config.onError ?? 'allow'

  ctx.on('tools/pre-execute', async (exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
    if (!watched.has(exec.name)) return next()

    const args = exec.arguments as { command?: unknown } | null
    const command = typeof args?.command === 'string' ? args.command.trim() : ''
    if (command === '') return next()

    const apiKey = process.env[apiKeyEnv]
    if (apiKey === undefined) {
      // 没有 key 就无法评估；按 onError 处置，与评估失败一致
      if (onError === 'deny') {
        return { kind: 'deny', reason: `jev-gate: 缺少 ${apiKeyEnv}，无法评估（fail-closed）` }
      }
      console.warn(`[jev-gate] 缺少 ${apiKeyEnv}，跳过评估: ${command}`)
      return next()
    }

    let assessment
    try {
      assessment = await screenCommand(command, { apiKey, model, timeoutMs, signal: exec.signal })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (onError === 'deny') {
        return { kind: 'deny', reason: `jev-gate: 评估失败（fail-closed）：${message}` }
      }
      console.warn(`[jev-gate] 评估失败，按配置放行: ${command} (${message})`)
      return next()
    }

    const action = route(assessment.nouls, assessment.severity, policy)
    const note = fireNote(assessment.nouls, assessment.severity, policy)

    if (action === 'block') {
      return {
        kind: 'deny',
        reason: `jev-gate [policy=${config.policy}] 拦截：${command}\n触发：${note}`,
      }
    }
    if (action === 'review') {
      return {
        kind: 'ask',
        reason: `jev-gate [policy=${config.policy}] 需要人工确认：${command}\n触发：${note}`,
      }
    }
    return next()
  })
}
