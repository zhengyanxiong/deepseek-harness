/**
 * Workbench panel locale dictionaries. Chinese is the source of truth; English
 * is the reviewed counterpart.
 */

/** Workbench panel copy keys. */
export type WorkbenchKey =
  | 'op.status.running' | 'op.status.stopping' | 'op.status.completed' | 'op.status.failed' | 'op.status.killed'
  | 'op.target' | 'op.newTarget' | 'op.content' | 'op.date' | 'op.time' | 'op.repeat' | 'op.once' | 'op.daily'
  | 'op.prepare' | 'op.pending' | 'op.explain' | 'op.invalidContent' | 'op.invalidTime' | 'op.failed'
  | 'op.preserved' | 'op.replaceDraft' | 'op.busy'
  | 'op.ready' | 'op.close' | 'op.search' | 'op.attention' | 'op.continue' | 'op.pin' | 'op.unpin'
  | 'op.timePrompt' | 'op.repeatPrompt'
  | 'panel'
  | 'title'
  | 'subtitle'
  | 'tabs.label'
  | 'tabs.command'
  | 'tabs.monitor'
  | 'top.palette'
  | 'top.voice'
  | 'palette.placeholder'
  | 'palette.mru'
  | 'palette.noMatch'
  | 'palette.noTargets'
  | 'palette.pickTarget'
  | 'palette.pickSession'
  | 'palette.pickJob'
  | 'cmd.group.sessions'
  | 'cmd.group.jobs'
  | 'cmd.group.planning'
  | 'cmd.group.navigation'
  | 'cmd.group.view'
  | 'cmd.openSession'
  | 'cmd.newSession'
  | 'cmd.newJob'
  | 'cmd.runWorkflow'
  | 'cmd.addTodo'
  | 'cmd.setReminder'
  | 'cmd.stopJob'
  | 'cmd.gotoMonitor'
  | 'cmd.gotoCommand'
  | 'cmd.summary'
  | 'cmd.prompt.workflow'
  | 'cmd.prompt.newJob'
  | 'cmd.prompt.todo'
  | 'cmd.prompt.reminder'
  | 'cmd.done.openSession'
  | 'cmd.done.stopJob'
  | 'cmd.failed.stopJob'
  | 'summary.fmt'
  | 'quick.aria'
  | 'ongoing.title'
  | 'ongoing.empty'
  | 'ongoing.stop'
  | 'reminders.today'
  | 'reminders.error'
  | 'events.sessionCreated'
  | 'events.sessionStarted'
  | 'events.sessionFinished'
  | 'events.jobStarted'
  | 'events.jobProgress'
  | 'events.jobFinished'
  | 'events.jobFailed'
  | 'events.jobStopped'
  | 'stream.title'
  | 'stream.empty'
  | 'stream.newEvents'
  | 'stream.offline'
  | 'trends.title'
  | 'trends.token'
  | 'trends.ctx'
  | 'trends.jobs'
  | 'progress.title'
  | 'progress.context'
  | 'progress.empty'
  | 'strip.input'
  | 'strip.output'
  | 'strip.context'
  | 'strip.trend'
  | 'spine.label'
  | 'spine.empty'
  | 'spine.more'
  | 'eyebrow.happening'
  | 'eyebrow.reference'
  | 'composer.workspace'
  | 'composer.workspaceLoading'
  | 'composer.workspacePlaceholder'
  | 'composer.newWorkspace'
  | 'drawer.openMain'
  | 'drawer.close'
  | 'drawer.unavailable'
  | 'toast.voiceP2'
  | 'toast.pickWorkspaceFirst'
  | 'toast.workspaceCreated'
  | 'toast.workspacePickFailed'
  | 'dlg.browseTitle'
  | 'dlg.home'
  | 'dlg.openHere'
  | 'dlg.newFolder'
  | 'dlg.folderName'
  | 'dlg.create'
  | 'dlg.cancel'
  | 'dlg.close'
  | 'dlg.loading'
  | 'dlg.empty'
  | 'dlg.truncated'
  | 'dlg.showHidden'
  | 'sessions.title'
  | 'sessions.loading'
  | 'sessions.empty'
  | 'sessions.running'
  | 'jobs.title'
  | 'jobs.empty'
  | 'jobs.running'
  | 'jobs.done'
  | 'reminders.title'
  | 'reminders.loading'
  | 'reminders.empty'
  | 'reminders.active'
  | 'reminders.inactive'
  | 'goals.title'
  | 'goals.empty'
  | 'goals.phase.active'
  | 'goals.phase.paused'
  | 'goals.phase.blocked'
  | 'goals.phase.complete'
  | 'tokens.title'
  | 'tokens.empty'
  | 'tokens.total'
  | 'tokens.input'
  | 'tokens.output'
  | 'tokens.cacheRead'
  | 'tokens.cacheWrite'
  | 'workflow.title'
  | 'workflow.empty'
  | 'subagents.title'
  | 'subagents.empty'
  | 'subagents.mode.one-shot'
  | 'subagents.mode.continuable'
  | 'subagents.mode.unknown'
  | 'teams.title'
  | 'teams.empty'
  | 'teams.role.lead'
  | 'teams.role.teammate'
  | 'teams.phase.provisioning'
  | 'teams.phase.active'
  | 'teams.phase.failed'
  | 'pager.prev'
  | 'pager.next'

/** Locale namespace the plugin registers under. */
export const NS = 'workbench' as const

export const zh: Record<WorkbenchKey, string> = {
  'op.status.running': '运行中', 'op.status.stopping': '正在停止', 'op.status.completed': '已完成', 'op.status.failed': '失败', 'op.status.killed': '已停止',
  'op.target': '目标会话', 'op.newTarget': '当前工作区的空白会话', 'op.content': '内容与要求',
  'op.date': '日期', 'op.time': '时间', 'op.repeat': '重复', 'op.once': '仅一次', 'op.daily': '每天',
  'op.prepare': '生成请求草稿', 'op.pending': '正在准备草稿…',
  'op.explain': '此操作会生成请求草稿，由你在右侧会话确认发送，再由助手执行；不会直接创建任务或提醒。已有会话草稿不会被覆盖。',
  'op.invalidContent': '请填写内容', 'op.invalidTime': '请选择有效的未来时间',
  'op.failed': '无法准备草稿，请稍后重试；内容已保留',
  'op.preserved': '目标会话已有未发送的草稿，为避免覆盖已保留。可替换后重新生成：',
  'op.replaceDraft': '替换目标草稿并生成', 'op.busy': '目标会话正在处理中，请稍后重试',
  'op.ready': '请求草稿已就绪，请在目标会话确认发送', 'op.close': '关闭操作区',
  'op.search': '搜索会话、任务或目标…',
  'op.attention': '需要处理', 'op.continue': '继续工作', 'op.pin': '置顶', 'op.unpin': '取消置顶',
  'op.timePrompt': '首次触发时间：{instant}；时区：{zone}', 'op.repeatPrompt': '重复方式：{repeat}',
  panel: '工作台',
  title: '工作台',
  subtitle: '跨会话总览：会话、任务、目标、提醒、工作流、子代理、团队与 token 占用',
  'tabs.label': '工作台分页',
  'tabs.command': '指挥台',
  'tabs.monitor': '监控',
  'top.palette': '命令面板（Ctrl/⌘+K）',
  'top.voice': '语音命令（P2 接入）',
  'palette.placeholder': '输入指令，如「打开会话」…',
  'palette.mru': '最近使用',
  'palette.noMatch': '没有匹配的命令',
  'palette.noTargets': '暂无可用目标，Esc 返回',
  'palette.pickTarget': '选择目标',
  'palette.pickSession': '选择会话',
  'palette.pickJob': '选择运行中的任务',
  'cmd.group.sessions': '会话',
  'cmd.group.jobs': '任务',
  'cmd.group.planning': '规划',
  'cmd.group.navigation': '导航',
  'cmd.group.view': '视图',
  'cmd.openSession': '打开会话',
  'cmd.newSession': '新会话',
  'cmd.newJob': '新建任务',
  'cmd.runWorkflow': '运行工作流',
  'cmd.addTodo': '加待办',
  'cmd.setReminder': '设提醒',
  'cmd.stopJob': '停止任务',
  'cmd.gotoMonitor': '切换监控',
  'cmd.gotoCommand': '切换指挥台',
  'cmd.summary': '汇总状态',
  'cmd.prompt.workflow': '运行工作流：',
  'cmd.prompt.newJob': '新建任务：',
  'cmd.prompt.todo': '添加待办：',
  'cmd.prompt.reminder': '提醒我：',
  'cmd.done.openSession': '已打开会话',
  'cmd.done.stopJob': '已停止任务',
  'cmd.failed.stopJob': '停止任务失败',
  'summary.fmt': '运行中会话 {sessions} · 运行中任务 {jobs} · 待触发提醒 {reminders} · 平均上下文 {ctx}%',
  'quick.aria': '快捷操作',
  'ongoing.title': '进行中',
  'ongoing.empty': '暂无进行中的会话或任务',
  'ongoing.stop': '停止任务',
  'reminders.today': '今日提醒 / 到期目标',
  'reminders.error': '提醒目录读取失败',
  'events.sessionCreated': '会话已创建',
  'events.sessionStarted': '开始运行',
  'events.sessionFinished': '已完成',
  'events.jobStarted': '任务已启动',
  'events.jobProgress': '进度更新',
  'events.jobFinished': '任务已完成',
  'events.jobFailed': '任务失败',
  'events.jobStopped': '任务已停止',
  'stream.title': '实时活动流',
  'stream.empty': '等待事件…',
  'stream.newEvents': '条新事件',
  'stream.offline': '连接中断，重连中',
  'trends.title': '资源趋势',
  'trends.token': 'token 消耗',
  'trends.ctx': '上下文占用',
  'trends.jobs': '任务吞吐',
  'progress.title': '任务 / 目标进度',
  'progress.context': '会话上下文',
  'progress.empty': '暂无进度数据',
  'strip.input': '输入',
  'strip.output': '输出',
  'strip.context': '上下文',
  'strip.trend': '查看趋势',
  'spine.label': '实时',
  'spine.empty': '等待事件…',
  'spine.more': '查看全部',
  'eyebrow.happening': '正在发生',
  'eyebrow.reference': '参考数据',
  'composer.workspace': '工作区',
  'composer.workspaceLoading': '正在加载工作区…',
  'composer.workspacePlaceholder': '选择工作区…',
  'composer.newWorkspace': '＋ 新建工作区…',
  'drawer.openMain': '在主视图打开',
  'drawer.close': '关闭',
  'drawer.unavailable': '无法打开该会话（可能已归档或删除）',
  'toast.voiceP2': '语音命令（P2）：将复用 STT 管线，未识别时回退插入草稿',
  'toast.pickWorkspaceFirst': '请先选择工作区',
  'toast.workspaceCreated': '工作区已创建',
  'toast.workspacePickFailed': '目录选择失败，请稍后重试',
  'dlg.browseTitle': '选择工作区目录',
  'dlg.home': '主目录',
  'dlg.openHere': '打开此目录',
  'dlg.newFolder': '新建文件夹',
  'dlg.folderName': '文件夹名称',
  'dlg.create': '创建',
  'dlg.cancel': '取消',
  'dlg.close': '关闭',
  'dlg.loading': '加载中…',
  'dlg.empty': '此目录下没有子文件夹',
  'dlg.truncated': '文件夹过多，仅显示开头部分。',
  'dlg.showHidden': '显示隐藏文件',
  'sessions.title': '会话总览',
  'sessions.loading': '正在加载…',
  'sessions.empty': '暂无会话',
  'sessions.running': '运行中',
  'jobs.title': '后台任务',
  'jobs.empty': '暂无后台任务',
  'jobs.running': '运行中',
  'jobs.done': '已完成',
  'reminders.title': '提醒',
  'reminders.loading': '正在加载…',
  'reminders.empty': '暂无提醒',
  'reminders.active': '待触发',
  'reminders.inactive': '已结束',
  'goals.title': '目标',
  'goals.empty': '暂无目标',
  'goals.phase.active': '进行中',
  'goals.phase.paused': '已暂停',
  'goals.phase.blocked': '已阻塞',
  'goals.phase.complete': '已完成',
  'tokens.title': 'Token · 上下文',
  'tokens.empty': '暂无 token 数据',
  'tokens.total': '累计',
  'tokens.input': '输入',
  'tokens.output': '输出',
  'tokens.cacheRead': '缓存读',
  'tokens.cacheWrite': '缓存写',
  'workflow.title': '工作流',
  'workflow.empty': '暂无工作流',
  'subagents.title': '子代理',
  'subagents.empty': '暂无子代理',
  'subagents.mode.one-shot': '单次',
  'subagents.mode.continuable': '可续接',
  'subagents.mode.unknown': '未知',
  'teams.title': '智能体团队',
  'teams.empty': '暂无团队',
  'teams.role.lead': '主导',
  'teams.role.teammate': '成员',
  'teams.phase.provisioning': '筹备中',
  'teams.phase.active': '活跃',
  'teams.phase.failed': '失败',
  'pager.prev': '上一页',
  'pager.next': '下一页',
}

export const en: Record<WorkbenchKey, string> = {
  'op.status.running': 'Running', 'op.status.stopping': 'Stopping', 'op.status.completed': 'Completed', 'op.status.failed': 'Failed', 'op.status.killed': 'Stopped',
  'op.target': 'Target session', 'op.newTarget': 'Blank session in the current workspace', 'op.content': 'Content and requirements',
  'op.date': 'Date', 'op.time': 'Time', 'op.repeat': 'Repeat', 'op.once': 'Once', 'op.daily': 'Daily',
  'op.prepare': 'Prepare request draft', 'op.pending': 'Preparing draft…',
  'op.explain': 'Prepare a request for you to review and send in the target conversation. The assistant then carries it out; this does not directly create tasks or reminders. Existing session drafts are not overwritten.',
  'op.invalidContent': 'Enter the content', 'op.invalidTime': 'Choose a valid future time',
  'op.failed': 'Unable to prepare the draft. Try again in a moment; your input is retained.',
  'op.preserved': 'The target session already holds an unsent draft, kept to avoid overwriting. Replace it and regenerate:',
  'op.replaceDraft': 'Replace target draft and regenerate', 'op.busy': 'The target session is busy; try again shortly',
  'op.ready': 'Request draft ready — review and send in the target conversation', 'op.close': 'Close operation panel',
  'op.search': 'Search sessions, jobs or goals…',
  'op.attention': 'Needs attention', 'op.continue': 'Continue work', 'op.pin': 'Pin', 'op.unpin': 'Unpin',
  'op.timePrompt': 'First occurrence: {instant}; time zone: {zone}', 'op.repeatPrompt': 'Repeat: {repeat}',
  panel: 'Workbench',
  title: 'Workbench',
  subtitle: 'Cross-session overview: sessions, jobs, goals, reminders, workflows, subagents, teams, and token usage',
  'tabs.label': 'Workbench tabs',
  'tabs.command': 'Command',
  'tabs.monitor': 'Monitor',
  'top.palette': 'Command palette (Ctrl/⌘+K)',
  'top.voice': 'Voice commands (P2)',
  'palette.placeholder': 'Type a command, e.g. "open session"…',
  'palette.mru': 'Recent',
  'palette.noMatch': 'No matching commands',
  'palette.noTargets': 'No targets available, Esc to go back',
  'palette.pickTarget': 'Pick a target',
  'palette.pickSession': 'Pick a session',
  'palette.pickJob': 'Pick a running job',
  'cmd.group.sessions': 'Sessions',
  'cmd.group.jobs': 'Jobs',
  'cmd.group.planning': 'Planning',
  'cmd.group.navigation': 'Navigation',
  'cmd.group.view': 'View',
  'cmd.openSession': 'Open session',
  'cmd.newSession': 'New session',
  'cmd.newJob': 'New job',
  'cmd.runWorkflow': 'Run workflow',
  'cmd.addTodo': 'Add todo',
  'cmd.setReminder': 'Set reminder',
  'cmd.stopJob': 'Stop job',
  'cmd.gotoMonitor': 'Switch to monitor',
  'cmd.gotoCommand': 'Switch to command',
  'cmd.summary': 'Summarize status',
  'cmd.prompt.workflow': 'Run workflow: ',
  'cmd.prompt.newJob': 'New job: ',
  'cmd.prompt.todo': 'Add todo: ',
  'cmd.prompt.reminder': 'Remind me: ',
  'cmd.done.openSession': 'Session opened',
  'cmd.done.stopJob': 'Job stopped',
  'cmd.failed.stopJob': 'Failed to stop the job',
  'summary.fmt': 'Running sessions {sessions} · running jobs {jobs} · active reminders {reminders} · avg context {ctx}%',
  'quick.aria': 'Quick actions',
  'ongoing.title': 'In progress',
  'ongoing.empty': 'No running sessions or jobs',
  'ongoing.stop': 'Stop job',
  'reminders.today': "Today's reminders / due goals",
  'reminders.error': 'Failed to read the reminder catalog',
  'events.sessionCreated': 'Session created',
  'events.sessionStarted': 'Started running',
  'events.sessionFinished': 'Finished',
  'events.jobStarted': 'Job started',
  'events.jobProgress': 'Progress update',
  'events.jobFinished': 'Job finished',
  'events.jobFailed': 'Job failed',
  'events.jobStopped': 'Job stopped',
  'stream.title': 'Realtime activity',
  'stream.empty': 'Waiting for events…',
  'stream.newEvents': 'new events',
  'stream.offline': 'Connection lost, reconnecting',
  'trends.title': 'Resource trends',
  'trends.token': 'Token usage',
  'trends.ctx': 'Context occupancy',
  'trends.jobs': 'Job throughput',
  'progress.title': 'Job / goal progress',
  'progress.context': 'Session context',
  'progress.empty': 'No progress data',
  'strip.input': 'Input',
  'strip.output': 'Output',
  'strip.context': 'Context',
  'strip.trend': 'View trends',
  'spine.label': 'Live',
  'spine.empty': 'Waiting for events…',
  'spine.more': 'View all',
  'eyebrow.happening': 'Happening now',
  'eyebrow.reference': 'Reference data',
  'composer.workspace': 'Workspace',
  'composer.workspaceLoading': 'Loading workspaces…',
  'composer.workspacePlaceholder': 'Choose workspace…',
  'composer.newWorkspace': '＋ New workspace…',
  'drawer.openMain': 'Open in main view',
  'drawer.close': 'Close',
  'drawer.unavailable': 'Cannot open that session (archived or removed)',
  'toast.voiceP2': 'Voice commands (P2): will reuse the STT pipeline, falling back to draft insertion',
  'toast.pickWorkspaceFirst': 'Pick a workspace first',
  'toast.workspaceCreated': 'Workspace created',
  'toast.workspacePickFailed': 'Directory picking failed — please try again',
  'dlg.browseTitle': 'Select Workspace Directory',
  'dlg.home': 'Home',
  'dlg.openHere': 'Open this folder',
  'dlg.newFolder': 'New folder',
  'dlg.folderName': 'Folder name',
  'dlg.create': 'Create',
  'dlg.cancel': 'Cancel',
  'dlg.close': 'Close',
  'dlg.loading': 'Loading…',
  'dlg.empty': 'No subfolders here',
  'dlg.truncated': 'Too many folders; only the beginning is shown.',
  'dlg.showHidden': 'Show hidden files',
  'sessions.title': 'Sessions',
  'sessions.loading': 'Loading…',
  'sessions.empty': 'No sessions yet',
  'sessions.running': 'Running',
  'jobs.title': 'Background jobs',
  'jobs.empty': 'No background jobs',
  'jobs.running': 'Running',
  'jobs.done': 'Done',
  'reminders.title': 'Reminders',
  'reminders.loading': 'Loading…',
  'reminders.empty': 'No reminders',
  'reminders.active': 'Active',
  'reminders.inactive': 'Ended',
  'goals.title': 'Goals',
  'goals.empty': 'No goals',
  'goals.phase.active': 'Active',
  'goals.phase.paused': 'Paused',
  'goals.phase.blocked': 'Blocked',
  'goals.phase.complete': 'Complete',
  'tokens.title': 'Tokens & context',
  'tokens.empty': 'No token data',
  'tokens.total': 'Total',
  'tokens.input': 'Input',
  'tokens.output': 'Output',
  'tokens.cacheRead': 'Cache read',
  'tokens.cacheWrite': 'Cache write',
  'workflow.title': 'Workflows',
  'workflow.empty': 'No workflow runs',
  'subagents.title': 'Subagents',
  'subagents.empty': 'No subagents',
  'subagents.mode.one-shot': 'One-shot',
  'subagents.mode.continuable': 'Continuable',
  'subagents.mode.unknown': 'Unknown',
  'teams.title': 'Agent teams',
  'teams.empty': 'No teams',
  'teams.role.lead': 'Lead',
  'teams.role.teammate': 'Teammate',
  'teams.phase.provisioning': 'Provisioning',
  'teams.phase.active': 'Active',
  'teams.phase.failed': 'Failed',
  'pager.prev': 'Previous page',
  'pager.next': 'Next page',
}
