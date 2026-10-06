/**
 * Workbench command registry (design §5): one declarative list both the
 * command palette and the 指挥台 quick actions render from, so a capability
 * ships through exactly one definition.
 */

import type { ComponentType } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  IconAlarmClockOutlineRegular, IconChecklistOutlineRegular, IconChevronLeftOutlineRegular,
  IconDataOutlineRegular, IconFlatListOutlineRegular, IconGaugeOutlineRegular,
  IconNewChatOutlineRegular, IconPlayOutlineRegular, IconQueueOutlineRegular,
  IconStopFillRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchKey } from './locales.ts'

/** A parameterized command resolves its target from a dynamic option list. */
export interface CommandOption {
  readonly id: string
  readonly label: string
}

/** One registered workbench command. */
export interface WorkbenchCommand {
  readonly id: string
  readonly nameKey: WorkbenchKey
  /** Lowercase match surface: zh name, pinyin, and English aliases. */
  readonly keywords: readonly string[]
  readonly groupKey: WorkbenchKey
  /** 常用命令 surface in the 快捷操作 row. */
  readonly common: boolean
  readonly icon: ComponentType<{ size?: number }>
  /** Present → selecting the command opens a second-level dynamic candidate list. */
  readonly param?: {
    readonly labelKey: WorkbenchKey
    options(): readonly CommandOption[]
  }
  run(target?: CommandOption): void | Promise<void>
}

/** Capabilities the commands map onto, injected by the browser entry. */
export interface CommandDeps {
  t(key: WorkbenchKey): string
  sessionOptions(): readonly CommandOption[]
  runningJobOptions(): readonly (CommandOption & { readonly sessionId: SessionId })[]
  openSession(sessionId: SessionId): void
  /**
   * Prime the workbench composer with a command template (or a fresh blank
   * session for 新会话); the panel owns the toasts so commands never report
   * work the user cannot see. The ready key names the command-specific toast
   * so each quick action reports what it actually staged.
   */
  startSession(prompt?: string, readyKey?: WorkbenchKey): void
  stopJob(sessionId: SessionId, jobId: string): Promise<boolean>
  switchTab(tab: 'command' | 'monitor'): void
  summaryText(): string
  notify(text: string, tone?: 'success' | 'error'): void
}

/**
 * Register the first batch of workbench commands, each mapped onto an existing
 * DSH capability (sessions / uiWorkspace navigation / jobs.kill / panel tabs).
 * @param deps - injected capabilities plus locale and feedback handles.
 * @returns the command list, in registry order.
 */
export function createWorkbenchCommands(deps: CommandDeps): WorkbenchCommand[] {
  const { t } = deps
  return [
    {
      id: 'open-session',
      nameKey: 'cmd.openSession',
      keywords: ['打开会话', 'dkh', 'open session'],
      groupKey: 'cmd.group.sessions',
      common: false,
      icon: IconFlatListOutlineRegular,
      param: { labelKey: 'palette.pickSession', options: () => deps.sessionOptions() },
      run: target => {
        if (target === undefined) return
        deps.openSession(target.id as SessionId)
        deps.notify(t('cmd.done.openSession'))
      },
    },
    {
      id: 'new-session',
      nameKey: 'cmd.newSession',
      keywords: ['新会话', 'xhy', 'new session', 'new chat'],
      groupKey: 'cmd.group.sessions',
      common: true,
      icon: IconNewChatOutlineRegular,
      run: () => {
        deps.startSession(undefined, 'toast.cmd.newSession')
      },
    },
    {
      id: 'stop-job',
      nameKey: 'cmd.stopJob',
      keywords: ['停止任务', 'ttrw', 'stop job', 'kill job'],
      groupKey: 'cmd.group.jobs',
      common: false,
      icon: IconStopFillRegular,
      param: { labelKey: 'palette.pickJob', options: () => deps.runningJobOptions() },
      run: target => {
        if (target === undefined) return
        const job = deps.runningJobOptions().find(option => option.id === target.id)
        if (job === undefined) return
        void deps.stopJob(job.sessionId, job.id).then(ok => {
          deps.notify(ok ? t('cmd.done.stopJob') : t('cmd.failed.stopJob'), ok ? 'success' : 'error')
        })
      },
    },
    {
      id: 'run-workflow',
      nameKey: 'cmd.runWorkflow',
      keywords: ['运行工作流', 'yxglc', 'run workflow', 'workflow'],
      groupKey: 'cmd.group.jobs',
      common: true,
      icon: IconPlayOutlineRegular,
      run: () => {
        deps.startSession(t('cmd.prompt.workflow'), 'toast.cmd.runWorkflow')
      },
    },
    {
      id: 'new-job',
      nameKey: 'cmd.newJob',
      keywords: ['新建任务', 'xjrw', 'new job', 'job'],
      groupKey: 'cmd.group.jobs',
      common: false,
      icon: IconQueueOutlineRegular,
      run: () => {
        deps.startSession(t('cmd.prompt.newJob'))
      },
    },
    {
      id: 'add-todo',
      nameKey: 'cmd.addTodo',
      keywords: ['加待办', 'jdb', 'todo', '待办'],
      groupKey: 'cmd.group.planning',
      common: true,
      icon: IconChecklistOutlineRegular,
      run: () => {
        deps.startSession(t('cmd.prompt.todo'), 'toast.cmd.addTodo')
      },
    },
    {
      id: 'set-reminder',
      nameKey: 'cmd.setReminder',
      keywords: ['设提醒', 'jtx', 'reminder', '提醒'],
      groupKey: 'cmd.group.planning',
      common: true,
      icon: IconAlarmClockOutlineRegular,
      run: () => {
        deps.startSession(t('cmd.prompt.reminder'), 'toast.cmd.setReminder')
      },
    },
    {
      id: 'goto-monitor',
      nameKey: 'cmd.gotoMonitor',
      keywords: ['切换监控', 'qhjk', 'monitor'],
      groupKey: 'cmd.group.navigation',
      common: true,
      icon: IconGaugeOutlineRegular,
      run: () => deps.switchTab('monitor'),
    },
    {
      id: 'goto-command',
      nameKey: 'cmd.gotoCommand',
      keywords: ['切换指挥台', 'qhzt', 'command'],
      groupKey: 'cmd.group.navigation',
      common: false,
      icon: IconChevronLeftOutlineRegular,
      run: () => deps.switchTab('command'),
    },
    {
      id: 'summary',
      nameKey: 'cmd.summary',
      keywords: ['汇总状态', 'hyzt', 'summary', 'status'],
      groupKey: 'cmd.group.view',
      common: false,
      icon: IconDataOutlineRegular,
      run: () => deps.notify(deps.summaryText()),
    },
  ]
}

/**
 * Fuzzy score over the localized name plus the keyword aliases:
 * prefix hit > substring hit > subsequence hit; higher wins.
 * @param name - localized command name.
 * @param keywords - lowercase alias list.
 * @param query - raw palette input.
 * @returns the best score, or -1 when nothing matches.
 */
export function scoreCommand(name: string, keywords: readonly string[], query: string): number {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return 0
  const surface = [name.toLowerCase(), ...keywords]
  let best = -1
  for (const candidate of surface) {
    let score = -1
    if (candidate.startsWith(q)) score = 100 - candidate.length
    else if (candidate.includes(q)) score = 60 - candidate.length
    else {
      let matched = 0
      for (const ch of candidate) {
        if (matched < q.length && ch === q[matched]) matched++
      }
      if (matched === q.length) score = 20
    }
    if (score > best) best = score
  }
  return best
}

