/**
 * TypeSafe Jev (System One) 调用层：电池模式的安全评估。
 * 与 jev-guard/src/jevguard/jev_judge.py 的 screen_command 同构。
 */

import { commandBattery } from './battery.ts'

export const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
export const PINNED_MODEL = 'jev-1.13.0'

export interface Assessment {
  nouls: Record<string, number>
  severity: number
}

export interface ScreenOptions {
  apiKey: string
  model?: string
  timeoutMs?: number
  signal?: AbortSignal
}

interface NoulAnswer { type: 'noul'; noul: number }
interface ScoreAnswer { type: 'score'; score: number; confidence: number }

/** 单条命令：一次请求跑完电池，返回 {nouls, severity} */
export async function screenCommand(command: string, options: ScreenOptions): Promise<Assessment> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000)
  const onAbort = () => controller.abort()
  if (options.signal) {
    if (options.signal.aborted) controller.abort()
    else options.signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        state: { proposed_tool_call: command },
        model: options.model ?? PINNED_MODEL,
        questions: commandBattery(),
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '<unreadable>')
      throw new Error(`TypeSafe HTTP ${response.status}: ${text.slice(0, 200)}`)
    }
    const json = await response.json() as {
      answers: Record<string, NoulAnswer | ScoreAnswer>
    }
    const nouls: Record<string, number> = {}
    let severity = 0
    for (const [qid, answer] of Object.entries(json.answers)) {
      if (answer.type === 'noul') nouls[qid] = answer.noul
      else severity = answer.score
    }
    return { nouls, severity }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
  }
}
