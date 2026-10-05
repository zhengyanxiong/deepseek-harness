/**
 * jev-gate：DeepSeek Harness 插件——把 Jev 安全门禁挂在 `tools/pre-execute` 上。
 *
 * 对应扩展点语义（docs/cookbook/extension-cookbook.md）：
 * - `allow` → next()，执行调用
 * - `deny`  → 本次调用以错误收场（block 场景）
 * - `ask`   → 经审批服务放行后才执行（review 场景）
 *
 * 配置两层（docs/cookbook/adding-a-settings-card.md）：
 * - base 层：cordis.yml 的 config 段（部署时给定）
 * - user 层：~/.dsh/settings.yaml 的 `jev-gate:` 段（installSection 注册后
 *   按字段覆盖，保存即生效，无需重启；删除字段即恢复默认）
 *
 * 设计纪律：本插件只收窄（deny/ask），从不放宽。评估失败默认放行但记日志
 * （onError: 'allow'），网络故障不应把开发工作完全锁死；追求强保证时切 'deny'。
 */
import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'

import { credentialRef, isCredentialRefName } from '@deepseek-ai/dsh-credentials'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-settings'
import type { PostToolDecision, PreToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

import { PINNED_MODEL, screenCommand } from './jev.ts'
import { POLICIES, fireNote, route } from './policies.ts'
import type { Policy } from './policies.ts'

export const name = 'jev-gate'
export const inject = ['tools']

/** settings namespace（join key：settings.yaml 里的段名） */
export const JEV_GATE_NS = 'jev-gate'

/**
 * pre-execute → post-execute 的评估传递表（以 exec.token 关联同一调用）。
 * 只有 pass 会暂存（deny/ask 已由决策契约呈现在轨迹里）；有界防泄漏：
 * 超限整体清空，post-execute 命中即删。
 */
const PENDING_ASSESSMENTS = new Map<unknown, { nouls: Record<string, number>; severity: number }>()
const PENDING_CAP = 1000

export interface Config {
  /** 命名策略：strict | permissive（POLICIES 的键） */
  policy?: string
  /** 要监控的工具名；bash/pwsh 的命令在 arguments.command */
  tools?: string[]
  /** TypeSafe API Key 的凭证引用名（默认 TYPESAFE_API_KEY）；经 ctx.credentials 解析，refs 层即 ~/.dsh/.credentials.yaml */
  apiKeyEnv?: string
  /** 钉死版本，不用 jev-latest */
  model?: string
  /** 评估请求超时 */
  timeoutMs?: number
  /** 评估失败时的处置：allow（放行+日志）| deny（fail-closed） */
  onError?: 'allow' | 'deny'
  /** verbose：每次评估在实例终端留一行完整 nouls 摘要（含 pass；默认关） */
  verbose?: boolean
  /** traceNote：把 pass 的评估画像以 notice 折叠行写进会话轨迹（默认关） */
  traceNote?: boolean
}

export const Config: z<Config> = z.object({
  policy: z.string().default('strict'),
  tools: z.array(z.string()).default(['bash', 'pwsh']),
  apiKeyEnv: z.string().default('TYPESAFE_API_KEY'),
  model: z.string().default(PINNED_MODEL),
  timeoutMs: z.number().default(8000),
  onError: z.union(['allow', 'deny'] as const).default('allow'),
  verbose: z.boolean().default(false),
  traceNote: z.boolean().default(false),
})

function resolvePolicy(cfg: Config): Policy {
  const policyName = cfg.policy ?? 'strict'
  return policyName in POLICIES
    ? POLICIES[policyName as 'strict' | 'permissive']
    : POLICIES.strict
}

/** 递归冻结：复刻 dsh-llm freezeMessage 的不可变语义（message 发布前必须冻结） */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
    Object.freeze(value)
  }
  return value
}

/**
 * 本地复刻 @deepseek-ai/dsh-llm 的 createUserMessage（{...input, role:'user',
 * id: uuid} 后深冻结）。不引它的运行时：其 lib/types 产物缺 lib/package.json，
 * tsconfig paths 指过去会在加载时炸；type-only 的类型引用只存在于编译期。
 */
function createNoticeMessage(text: string, summary: string): UserMessage {
  return deepFreeze({
    id: randomUUID(),
    role: 'user' as const,
    content: [{ type: 'text' as const, text }],
    source: {
      kind: 'plugin' as const,
      plugin: 'jev-gate',
      form: 'notice' as const,
      summary,
    },
  } as unknown as UserMessage)
}

/**
 * 解析评估用的 API key：优先走 dsh 凭证缝（`ctx.credentials`），解析顺序为
 * 进程环境变量 > ~/.dsh/.credentials.yaml 的 refs（受管存储，Models 页可写、
 * 外部编辑热更新）> 启动 cwd 的 .env > ~/.dsh/.env；凭证服务未加载时
 * （standalone / selfcheck 场景）回退进程环境变量。
 */
async function resolveApiKey(ctx: Context, apiKeyEnv: string): Promise<string | undefined> {
  if (isCredentialRefName(apiKeyEnv)) {
    const hit = await ctx.get('credentials')?.resolve(credentialRef(apiKeyEnv))
    if (hit !== undefined) return hit.value
  }
  return process.env[apiKeyEnv]
}

export function apply(ctx: Context, config: Config): void {
  // 配置数据源：初始为 base 层（cordis.yml）；settings 用户层覆盖后经
  // setSource 换成运行时源。监听每次读取都走 source()，改配置无需重启。
  let source = () => config

  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, JEV_GATE_NS, Config, config, {
      setSource: (current) => { source = current },
      // 读取是惰性的（每次 pre-execute 现取 source()），无需重建，仅满足钩子契约
      onChange: () => {},
    })
  })

  ctx.on('tools/pre-execute', async (exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
    const cfg = source()
    const watched = new Set(cfg.tools ?? ['bash', 'pwsh'])
    if (!watched.has(exec.name)) return next()

    const args = exec.arguments as { command?: unknown } | null
    const command = typeof args?.command === 'string' ? args.command.trim() : ''
    if (command === '') return next()

    const apiKeyEnv = cfg.apiKeyEnv ?? 'TYPESAFE_API_KEY'
    const onError = cfg.onError ?? 'allow'
    const apiKey = await resolveApiKey(ctx, apiKeyEnv)
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
      assessment = await screenCommand(command, {
        apiKey,
        model: cfg.model ?? PINNED_MODEL,
        timeoutMs: cfg.timeoutMs ?? 8000,
        signal: exec.signal,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (onError === 'deny') {
        return { kind: 'deny', reason: `jev-gate: 评估失败（fail-closed）：${message}` }
      }
      console.warn(`[jev-gate] 评估失败，按配置放行: ${command} (${message})`)
      return next()
    }

    const policy = resolvePolicy(cfg)
    const action = route(assessment.nouls, assessment.severity, policy)
    const note = fireNote(assessment.nouls, assessment.severity, policy)

    if (cfg.verbose === true) {
      // 完整画像一行留痕：deny/ask 的 reason 只含越线项，校准需要全量 nouls
      const summary = Object.entries(assessment.nouls)
        .map(([hazard, p]) => hazard + '=' + p.toFixed(2))
        .join(' ')
      console.info('[jev-gate] ' + action + ' | ' + command + ' | ' + summary
        + ' | severity=' + assessment.severity.toFixed(2))
    }

    if (action === 'block') {
      return {
        kind: 'deny',
        reason: `jev-gate [policy=${cfg.policy}] 拦截：${command}\n触发：${note}`,
      }
    }
    if (action === 'review') {
      return {
        kind: 'ask',
        reason: `jev-gate [policy=${cfg.policy}] 需要人工确认：${command}\n触发：${note}`,
      }
    }
    // pass：评估结果暂存，post-execute 按需转成轨迹 notice（traceNote）
    if (PENDING_ASSESSMENTS.size >= PENDING_CAP) PENDING_ASSESSMENTS.clear()
    PENDING_ASSESSMENTS.set(exec.token, { nouls: assessment.nouls, severity: assessment.severity })
    return next()
  })

  // 轨迹注记：pass 的评估画像以 notice 折叠行写进会话轨迹（可展开看全量画像）。
  // observe-and-enrich、从不否决——写法对齐 guard/repeat-tool-reminder 的成熟先例；
  // denied 调用也会经过本瀑布，注记同样折上（被下游 block 时评估事实仍然成立）。
  ctx.on('tools/post-execute', async (exec: ToolExecution, _result: Readonly<ToolExecutionResult>, next: () => Promise<PostToolDecision>): Promise<PostToolDecision> => {
    const downstream = await next()
    const cached = PENDING_ASSESSMENTS.get(exec.token)
    if (cached === undefined) return downstream
    PENDING_ASSESSMENTS.delete(exec.token)
    if (source().traceNote !== true) return downstream
    if (exec.agent === undefined) return downstream // 直接 tools.execute() 调用无轨迹可注

    const entries = Object.entries(cached.nouls)
    const highest = entries.reduce((a, b) => (b[1] > a[1] ? b : a))
    const summaryText = entries.map(([hazard, p]) => hazard + '=' + p.toFixed(2)).join(' ')
    const notice: UserMessage = createNoticeMessage(
      'jev-gate 评估画像：' + summaryText + ' | severity=' + cached.severity.toFixed(2),
      'jev-gate：放行 · 最高 ' + highest[0] + '=' + highest[1].toFixed(2),
    )
    const contexts = [notice, ...downstream.additionalContexts ?? []]
    if (downstream.kind === 'block') {
      return { kind: 'block', feedback: downstream.feedback, additionalContexts: contexts }
    }
    return { ...downstream, additionalContexts: contexts }
  })
}
