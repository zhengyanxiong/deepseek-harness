# dsh-workbench · 个人开发工作台设计方案

状态：v2 已确认（2026-10-05）；P0/P1 已于 2026-10-06 实现（见文末「实现进度」）。v2（2026-10-05 修订）：修复趋势窗口与缓冲矛盾、P0 定义矛盾、
活动流滚动冲突；新增状态模型、命令参数补全、空态/错误态、响应式与行级动作约定；开放项全部拍板。
实现时以此为准；每次改动落地后回写本文档的进度标注与变更日志（见文末）。

## 1. 目标与非目标

**目标**

- 把现在的静态概览面板升级成「可执行 + 可监控」的个人开发工作台。
- 用 tab 分页组织：**指挥台**（默认）+ **监控**，指挥与监控一体、边界清晰。
- 监控侧提供动态图形化：**实时活动流 + 资源趋势**。
- 先落地统一命令面板，语音作为同一命令模型的后续升级（复用 DSH 已有 STT 管线）。

**非目标（当前不做）**

- 不在 P0/P1 引入图表库；图形用轻量 SVG/CSS。
- 不做独立规划 tab（待办/目标/日程），留作 P2 可选。
- 语音不做独立的语音查询回答引擎，只做「转写 → 命令解析 → 执行」。

## 2. 总体结构

顶部复用 `ui-primitives` 的 `SegmentedTabs`，右侧固定全局命令面板入口：

```
┌──────────────────────────────────────────────────────────┐
│ [ 指挥台 ]  [ 监控 ]                    🔎 输入指令…   [🎤] │
├──────────────────────────────────────────────────────────┤
│              960px 内容区 · clamp(24px,4vw,48px) 留白       │
└──────────────────────────────────────────────────────────┘
```

- 内容区沿用 Web 页面规范：960px 上限 + `clamp(24px,4vw,48px)` 左右留白 + 48px 底部。
- 两个 tab 都是同一 `main` 面板内的视图切换，不新开面板、不新开 slot。
- **响应式**：内容区 < 720px 时，指挥台的左右分栏与监控的双栏均折为单列；三列 sparkline 折为
  纵向堆叠。断点只用一档，不做过细适配。

## 3. 指挥台（默认 Tab）

把现有 8 路数据源从「只读列表」演进为「可点执行」。

```
┌───────────────────────────────────────────────────────────┐
│ ⌘ 命令面板（可折叠，选中态高亮）                              │
│   > 打开会话 / 新建任务 / 运行工作流 / 加待办 / 设提醒 / 切监控  │
├───────────────────────────────────────────────────────────┤
│ 快捷操作  [＋新会话] [▶工作流] [＋待办] [⏰提醒] [📊监控]     │
├──────────────────────────┬────────────────────────────────┤
│ 进行中                    │ 今日提醒 / 到期目标              │
│ ● 会话 A  · 5 轮          │ ⏰ 15:00 提交周报               │
│ ● 会话 B  · 运行中        │ ◉ 目标 D  · 2/5 轮              │
│ ● 工作流 C  ▓▓▓▓░░ 63%   │ ◉ 目标 E  · 已阻塞              │
├──────────────────────────┴────────────────────────────────┤
│ 资源速览  输入 1.2M · 输出 0.6M · 上下文 58%   [查看趋势 ↗]   │
├───────────────────────────────────────────────────────────┤
│ ✎ 发消息或创建任务，/ 调用指令，@ 文件或对话       [模型 ▾] [➤] │
│ （sticky 悬浮于 tab 底部，复用 dsh composer 全部能力）        │
└───────────────────────────────────────────────────────────┘
```

**悬浮对话输入框（v2 新增，v2.1 改为真实发送）**

- 位置：指挥台 tab 内容区底部 sticky 悬浮，随 tab 滚动常驻可视；切到监控 tab 自动隐藏。
- 定位变化（v2.1）：不再是「展示态 composer + 草稿注入」，而是**直接驱动 dsh 原生输入机**的真实发送管道——
  工作台输入框只负责采集文本，发送动作走 `conversation.input`（SessionInputResolver）这套宿主原生接口，
  不新造输入引擎。外观只保留真实可用的元素：输入区 + 发送按钮；原 v2 的模型/上下文/附件/语音展示态
  chip 全部移除（避免「假能力」观感），需要那些能力时进入会话使用宿主原生 composer。
- 发送目标与管道（`sendPrompt`，注册侧实现）：
  1. 主视图已有会话（`sessions.list` 中 `retainedBy.mainView > 0`）→ 向该会话直接发送：
     `requestDraftInitialization(binding, { prompt })`（尊重已有草稿，非空则拒发并提示）→ 成功后
     `conversation.input.shell(sessionId).submit()`，与在该会话 composer 里按 Enter 完全同一条提交路径。
  2. 无主视图会话 → 取最近活跃 workspace（复刻 ui-workspace 的 recentWorkspace 规则）→
     `uiWorkspace.connectWorkspace`（复用空白会话或新建）→ `openSession` 导航 → 同上的
     draft 初始化 + `submit()`（空白复用场景允许 `clearPreviousDraft` 覆盖陈旧草稿）。
  3. 以上任一步骤服务不可用或建会话失败 → 降级回 v2 的 `startSession` 草稿注入管道，并提示用户
     「已填入草稿，确认后发送」。
- 行为：Enter 发送、Shift+Enter 换行；发送后消息进入该会话正常对话，工作台侧以活动流事件回显
  「发送 → 运行中 → 完成」状态，不在工作台内嵌对话气泡区。
- 命令面板的「新会话 / 运行工作流」等仍走草稿注入（模板类 prompt 需要用户确认后再发），不受影响。

**交互约定**

- 每行必须有明确的 primary action，写死在行定义里：
  - 会话行点击 → 打开该会话（`slots` 的会话导航能力）。
  - 任务/工作流行点击 → 跳到所属会话；运行中任务的行尾提供「停止」次按钮。
  - 提醒行点击 → 跳转会话；行尾「完成」次按钮标记已处理。
  - 目标行点击 → 打开目标所属会话；「已阻塞」行点击额外弹出阻塞原因摘要。
- 快捷操作**不自建命令**，从命令注册表取「常用」标记的命令自动生成，单点维护。
- 现有卡片的分页器保留，每页 5 条不变。
- 卡片材质、字号、字重（≤500）、状态 Tag/StateDot 全部沿用现有规范。

**空态 / 加载态 / 错误态（每卡必须实现）**

- 加载中：现有 `phase === 'pending'` 文案保留。
- 空数据：沿用现有 empty 文案；指挥台整体全空时，空白区给一句引导文案 + 「＋新会话」按钮。
- 数据源错误：卡片不消失，标题旁显示 error StateDot + 重试按钮，卡片体显示降级文案。

## 4. 监控（Tab 2）

```
┌───────────────────────────────────────────────────────────┐
│ 资源趋势   [1h | 6h | 24h]                                  │
│  ╱╲╱╲╱╲  token 消耗     ╱╲╱╲  上下文占用   ┃▁▂▃▄ 任务吞吐   │
│  (轻量 SVG sparkline，state token 着色，tabular-nums 数值)   │
├──────────────────────────┬────────────────────────────────┤
│ 实时活动流（新事件插顶）     │ 任务 / 目标进度                 │
│ 14:32 ● 会话A 完成 工具X   │ 工作流 C  ▓▓▓▓░░  63%          │
│ 14:30 ● 子代理B 启动       │ 目标 D    ▓▓▓░░░  40%          │
│ 14:27 ● 提醒E 已到期       │ 会话F 上下文 ▓▓▓▓▓▓  78%        │
│ (自动滚动，事件带 StateDot)  │                                │
└──────────────────────────┴────────────────────────────────┘
```

**图形规范**

- 不引 chart 库：sparkline / 进度条 / 环形用内联 SVG + CSS。
- 折线着色 `--dsw-alias-state-{business,success,warn,error}`；轴/网格 `--dsw-alias-border-*`。
- 数字 `font-variant-numeric: tabular-nums`；12–13px；字重 ≤500。
- 卡片 `--dsw-radius-xl` + settings-card 材质；趋势时间窗切换用 `SegmentedControl`；活动流事件用 `StateDot` 标类型。

**实时活动流（修订：滚动策略与背压）**

- **滚动策略**：列表 pin 在底部（最新可见）时自动跟随新事件；用户上翻离开底部时，停止自动滚动，
  顶部出现「N 条新事件 ↓」悬浮条，点击回到底部并恢复跟随。「插顶」与「自动滚动」不再同时无条件生效。
- **合批**：同一来源（同一 job / 同一会话）250ms 内的连续事件合并为一帧渲染，进度类更新只留最新值。
- **限长**：活动流最多保留 200 条，超出从尾部丢弃；条数接近上限时标题旁显示滚动提示。
- **断线**：事件源断开时，列表顶部显示 error StateDot + 「连接中断，重连中」；恢复后自动补拉
  断线期间的状态快照（以快照为准，不补发丢失的逐条事件）。

**资源趋势（修订：采样落盘 + 窗口匹配）**

- 采样：30s 一帧，采样 `tokenUsage` / `contextPressure` / 任务吞吐聚合值。
- **持久化**：每帧追加写入宿主轻量存储（本地 JSON 追加文件，量极小），页面刷新后历史不丢。
- 内存只保留热区（最近 96 点 ≈ 48 分钟）用于 sparkline 渲染；切到 6h / 24h 窗口时从持久化
  序列降采样读取（6h 按 6 帧聚合、24h 按 24 帧聚合）。
- 窗口与数据长度匹配：1h 窗口显示 120 点（30s 原始帧），6h/24h 显示降采样后的等距点，
  保证任何窗口都有完整曲线，不再出现空白图。
- 快照与曲线同源：指挥台「资源速览」的当前值 = 趋势序列最后一帧，不允许两处各自采样。

## 5. 命令面板 + 语音（统一命令模型）

- 面板 UI 复用 `Input` + `Menu`/`MenuGroup`：模糊匹配 + 分组 + 键盘高亮。
- 命令注册表：`WorkbenchCommand { id, 关键词, 参数, 分组, 常用, 执行 }`，指挥台与监控均可唤起。
- 首批命令映射到 DSH 已有能力：`打开会话`(sessions) / `新建任务`(jobs) / `运行工作流`(workflow) /
  `加待办`(todo) / `设提醒`(schedule) / `切换监控`(面板内导航) / `汇总状态`(聚合现有投影)。
- **参数化命令（修订）**：带参数的命令（如「打开会话 X」）选中后进入二级动态补全，
  候选项由对应数据源的当前投影提供（会话列表、任务列表、工作流模板），不回退到自由文本。
  无候选项时提示「暂无可用目标」并允许 Esc 返回命令层。
- **匹配与反馈（修订）**：模糊匹配按「前缀命中 > 子串命中 > 拼音/缩写」打分，分组内按分数排序；
  命令执行后一律给 toast 反馈（成功/失败 + 原因），失败的命令不改变面板状态。
- **快捷键（修订）**：唤起键定为 `Ctrl/Cmd + K`；实现前全局排查 DSH 现有快捷键冲突，冲突则降级为
  `Ctrl/Cmd + .`。
- **最近使用（拍板）**：MRU 分组 P0 直接做——命令选中执行后插到 MRU 顶部（最多 5 条），
  面板打开时 MRU 分组置顶展示；不做收藏。
- 语音演进：复用 `client-ui-voice-input` + `speech-to-text` 的 STT，把「转写结果」从
  「插入草稿」改为「喂给命令解析器」。路径：文字命令面板 → 🎤 按钮（按住说话）→ 语音命令。
- **语音降级（拍板）**：转写结果匹配不到任何命令时，不报错、不打断，自动回退为把转写文本
  插入当前草稿（与现有 voice-input 行为一致），保证用户不会「说了一句话什么都没发生」。

## 6. 数据流与状态模型

**新增两项数据流：**

1. **实时活动流**：订阅 job 状态变更 + 会话/子代理生命周期事件，聚合为时间线。
2. **资源趋势时间序列**：客户端定时采样 `tokenUsage`/`contextPressure`，写环形缓冲
   与持久化序列喂给 sparkline（规则见 §4）。

**状态模型（新增小节，P1 前置）**

- 引入一个面板级 `workbenchStore` 聚合层：8 路数据源投影 + 事件流 + 采样器都挂到它下面，
  两个 tab 通过 selector 订阅派生状态，**不允许组件各自直连数据源**。
- 订阅去重：同一数据源在 store 内只保留一份订阅，多消费者共享。
- 生命周期：tab 不可见时暂停其专属订阅（活动流、趋势采样），指挥台保留轻量轮询；
  面板关闭时统一退订。
- 事件源断线重连由 store 统一处理，组件只消费 `status: live | reconnecting | stale` 派生值。

## 7. 分阶段路线

- **P0（可交互骨架）**：Tab 框架 + 指挥台（命令面板 + 快捷操作 + 可点击卡片 + 底部悬浮对话输入框）。
  原则：**「假数据、真管道」**——命令注册表与点击执行链路全部真实接通 `slots`/`ctx` 能力，
  悬浮输入框直接复用 dsh composer（真实对话管道），
  各卡片投影数据允许 mock，但必须经过 `workbenchStore` 的 selector 形状，不允许组件私造数据结构。
  MRU 分组随命令面板一起做。
- **P1（动态图形化）**：监控 tab（活动流 + 资源趋势 sparkline + 进度），含状态模型、
  事件聚合 + 合批、时间序列采样与落盘。
- **P2（语音 + 规划）**：语音命令（复用 STT，含降级回退）+ 可选规划 tab。

## 8. 开放项

（2026-10-05 全部拍板，实现期只许微调、不许推翻；如需推翻须先改本文档。）

- 资源趋势：30s 采样、96 点热区 + 落盘降采样，窗口 1h/6h/24h（§4）。
- 命令面板：做 MRU（最多 5 条），不做收藏（§5）。
- 语音与 `client-ui-voice-input` 边界：共用 STT 管线，转写结果先走命令解析，未识别回退插入草稿（§5）。

## 9. 变更日志

- **v2（2026-10-05）**：修复三处硬伤——趋势窗口 vs 缓冲长度矛盾（改采样落盘 + 降采样）、
  P0「静态数据能执行」矛盾（改「假数据、真管道」）、活动流插顶与自动滚动冲突（改 pin + 新事件条）；
  新增状态模型（§6）、命令参数二级补全、MRU、快捷键冲突排查、空态/错误态、响应式、
  行级 primary action、语音降级回退；开放项全部拍板；追加指挥台底部悬浮对话输入框
  （复用 dsh composer，含模型/上下文/附件/指令/提及能力）。
- **v1（2026-10-05）**：初版，已确认。

## 10. 实现进度（2026-10-06 回写）

- **P0 已落地**：双 tab 骨架（`SegmentedTabs`，同一 main 面板内切换）；命令注册表
  10 条命令全部走真实能力（`uiWorkspace.openSession/startSession`、`jobs.kill`、面板导航、
  聚合投影），命令面板含模糊匹配、MRU（最多 5 条）、参数二级动态补全、toast 反馈；
  快捷操作由注册表 `common` 标记自动生成；8 路数据源卡片保留分页器且行可点
  （打开会话 / 悬停停止任务）；底部悬浮 composer 为真实发送管道（`conversation.input`
  原生提交路径，详见「悬浮对话输入框 v2.1」）。
- **P1 已落地**：活动流由会话/任务快照差分推导（真实事件管道，250ms 同来源合批、
  200 条上限、pin 顶部跟随 + 「N 条新事件」悬浮条）；趋势采样 30s 一帧，96 点内存热区
  + localStorage 落盘（保留 24h），1h/6h/24h 窗口降采样到 ≤120 桶；任务/目标/上下文进度条。
- **与文档的偏差（实现期微调）**：① 趋势落盘用 localStorage 代替「宿主 JSON 追加文件」
  （Web 客户端的宿主轻量存储即 localStorage）；② 悬浮 composer 的模型/上下文/附件/语音
  展示态 chip 已于 v2.1 全部移除，发送改为 `conversation.input` 原生提交路径（草稿注入仅
  作降级回退）；③ 活动流 `status` 当前恒为
  `live`（数据源是客户端可自动重订阅的 host observables，无显式断线信号）。
- **修复记录（2026-10-06）**：监控 tab 打不开——`store.ts` 两个 store 的 `getSnapshot()`
  每次返回新对象，违反 `useSyncExternalStore` 缓存快照契约导致渲染抛错；已改为变更时重建
  缓存快照，并在 smoke 中补监控 tab 直渲染断言防回归。
- **v3 已落地（2026-10-06）**：§11 原生会话抽屉 + §11.5 工作区指定 composer 全部实现。
  工作台 main 注册声明 `workbench.composer.conversation` / `workbench.drawer.conversation`
  两个 session-scope child（面板 kit 由此获得 SessionProvider + renderSlot），
  `ConversationEmbed` 一个组件注册进两个 slot：`renderFactorySlot('conversation.content',
  …)` 渲染原生会话——composer 模式覆盖 views 为空 + phase 固定 active（只剩原生
  InputBar），drawer 模式照抄 ui-subagent ConversationSlotPanel 的 phase 推导 +
  FixedChatConversationView。面板侧：工作区下拉（默认最近活跃）+「＋新建工作区…」走
  `pickDirectory()` + `workspaces.create()`；选定后 `connectWorkspace` 复用/新建 blank
  会话并以 `workbenchComposer` source retain，SessionProvider 显式绑定；composer 会话
  blank→false 自动滑出抽屉（`workbenchDrawer` source retain，宽度可拖拽、localStorage
  记忆、Esc/遮罩关闭）；卡片行点击改走抽屉，抽屉头部 ↗ 进主视图。v2.1 的 sendPrompt /
  Composer.tsx 已删除（原生 InputBar 取代）。package.json `dsh.client.inject` 增补
  ui-conversation / ui-workspace / api-workspace-controller。
- **P2 未做**：语音命令（STT 入口已留，点击提示 P2）、规划 tab。


---

## 11. 设计变更 v3：原生会话抽屉（2026-10-06，已拍板待实现）

**需求**：悬浮输入框和聊天页都不要自绘仿品——直接嵌入 dsh 原生对话组件；发送后聊天页
从当前页面右侧抽屉滑出、不遮满屏、可继续对话。

### 11.1 可行性结论（基于源码核实）

原生对话 UI **可以**完整嵌入第三方插件的自定义表面，依据是 ui-subagent 的
`sidebar-chat`（`packages/client/ui-subagent/src/client/sidebar-chat/index.tsx`）就是现成
样板：右侧栏 tab 里渲染出了带原生 InputBar 的完整会话。三条关键机制：

1. **`conversation.content` 是全局工厂 slot**（ui-conversation `apply.ts`
   `registerFactory`），children 含 `conversation.session`（消息流，经 `views` slot）与
   `conversation.composer` / `conversation.composer.bar`（原生 InputBar，模型选择、附件、
   slash 指令、@ 引用全部可用）。它声明 `scope: 'session-maybe'`。
2. **`renderFactorySlot(name, props, options)` 下发给每一个 slot 注册组件**（ui-renderer
   `scoped-slots.tsx` 的 `standardKit`），按名字渲染任意已注册工厂 slot，无归属限制；
   subagent 用它渲染 `('conversation.content', { variant: 'embedded', phase, hero },
   { slots: { views: FixedChatConversationView } })`。`variant: 'embedded'` 是原生支持的
   嵌入形态。
3. **`SessionProvider` 支持显式 `session={SessionReference}` prop**（`scopeAreaProvider`，
   `explicit = Object.hasOwn(props, 'session')`）：任意保留的会话引用都可以包住一棵
   会话作用域子树，不依赖主视图当前选中谁。组件拿到 SessionProvider 的条件是其 slot
   注册声明了非 root scope 的 child（`standardKit` 自动注入）。

**反向结论**（避免走弯路）：原生组件不跨 bundle 导出，插件不能直接 import InputBar；
`ctx.slots.renderSlot` 只能渲染 root；子 slot 只能渲染自己声明的 children。所以嵌入
原生对话的唯一正路就是上面的工厂 slot + 显式 SessionProvider。

### 11.2 选定方案：工作台面板内右侧抽屉（方案 B）

不占用宿主右侧栏（那是与主视图会话绑定的常驻 grid track），而是**在工作台 main 面板
内部**做一个右侧滑出抽屉：

```
┌──────────────── 工作台 main 面板 ────────────────┐
│ 指挥台 / 监控  tabs                    [🔍] [🎤] │
│ ┌─────────────┐ ┌──────────────────────────────┐ │
│ │  工作台卡片  │ │  抽屉（原生会话）              │ │
│ │  （保持可见）│ │  ┌──────────────────────────┐│ │
│ │             │ │  │ 会话标题        ↗主视图 ✕ ││ │
│ │             │ │  ├──────────────────────────┤│ │
│ │             │ │  │                          ││ │
│ │             │ │  │   原生消息流（chat view）  ││ │
│ │             │ │  │                          ││ │
│ │             │ │  ├──────────────────────────┤│ │
│ │             │ │  │  原生 InputBar（全能力）   ││ │
│ │             │ │  └──────────────────────────┘│ │
│ └─────────────┘ └──────────────────────────────┘ │
│ ✎ 工作台 composer（快速发送入口，保留）            │
└───────────────────────────────────────────────────┘
```

- **抽屉壳自绘**（唯一自绘部分）：右侧滑出，宽 480px（可拖拽调宽，localStorage 记忆），
  半透明遮罩点击关闭，Esc 关闭；头部 = 会话标题 + 「在主视图打开 ↗」+ 关闭。壳内内容区
  **零自绘**。
- **壳内渲染管线**（完全复刻 subagent sidebar-chat 架构）：
  1. 工作台 `main` 注册声明 child `'workbench.drawer.conversation': { kind: 'single',
     scope: 'session' }`（同时给面板 kit 注入 `SessionProvider` / `renderSlot`）。
  2. 面板渲染抽屉 DOM，内部 `<SessionProvider session={reference}>`（显式 retain 的引用）
     包住 `renderSlot('workbench.drawer.conversation', {})`。
  3. 注册进该 slot 的组件拿到会话 kit（`useSession` / `useConversation` /
     `renderFactorySlot`），计算 `phase`（复刻 subagent 的 blank/engaging/active 判定）
     后 `renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero },
     { slots: { views: FixedChatConversationView } })`。`FixedChatConversationView` 照抄
     subagent 的三行实现（固定渲染 `conversation.session` 的 chat 视图）。
- **会话引用管理**：新增 retain source `workbenchDrawer`（augment
  `SessionReferenceSourceMap`）；抽屉打开期间 `ctx.sessions.retain(target, { source:
  'workbenchDrawer' })`，关闭/卸载释放。同一会话可在抽屉与主视图并行打开（InputHub
  按 binding 缓存 shell，subagent 侧栏聊天与主视图并行即证明）。
- **打开时机**：
  - 工作台底部 composer 输入 + Enter：建/复用会话 → 自动发送第一条（沿用 v2.1 的
    `sendPrompt` 原生提交管道）→ 打开抽屉显示该会话；
  - 工作台卡片行点击：从「主视图全屏打开」改为「抽屉打开该会话」（轻量并排查看）；
    抽屉头部的 ↗ 按钮才进主视图全屏。
- **抽屉状态**：`open: boolean + sessionId` 存面板 state（抽屉随工作台面板存在；切走
  再切回保持）。发送后抽屉保持打开，用户直接在原生 InputBar 继续对话。

### 11.3 弃选方案及理由

- **方案 A（右侧栏 tab，全套复刻 sidebar-chat）**：宿主 rightbar 的 `rightbar.session`
  是 session-scope 且跟随主视图当前会话；工作台无会话打开时 tab 挂载与 `openTab` 目标
  会话的行为需要额外验证，且 rightbar 是常驻 grid track 不是抽屉，与「划出、不占满」
  的诉求形态不符。若后续想把工作台会话升级为全局能力可回退到此方案（代码模式相同）。
- **自绘消息流 + 原生提交**：消息流仍是自己画的列表，达不到「原生」要求，弃。
- **发送后 `layout.selectPanel(null)` 进主视图**：是全屏原生对话但无抽屉形态，作为
  抽屉头部 ↗ 按钮的行为保留。

### 11.4 实现清单（待开工）

1. `index.ts`：main 注册加 children 声明；新增 `drawer` action 面（open/close/状态源），
   retain/release 生命周期挂 effect。
2. 新增 `DrawerConversation.tsx`：注册 `'workbench.drawer.conversation'`，照抄
   ConversationSlotPanel 的 phase 计算 + renderFactorySlot 调用。
3. `WorkbenchPanel.tsx`：抽屉壳 DOM（滑入动画、拖拽调宽、遮罩、Esc），头部按钮；
   卡片行点击改走抽屉。
4. `Composer` 发送成功后联动打开抽屉。
5. locales + CSS + smoke 桩（renderFactorySlot / SessionProvider 打桩）更新。
6. 风险点（实现时验证）：工厂 slot 的 `variant/phase/hero` props 全兼容；嵌入 InputBar
   在窄宽度（480px）下的表现；与监控 tab 同屏时的滚动隔离。


### 11.5 composer 定稿：原生 InputBar + 工作区指定（2026-10-06 追加需求）

**追加需求**：工作台 composer 直接用原生 InputBar；输入框对应的会话所在**工作区由用户指定**；
列表里没有的工作区要能**当场新建**，然后再进行会话操作。

#### 调研结论（源码核实）

- 原生 `conversation.content` 的 hero 形态**自带工作区选择器**（`conversation.hero.workspace`
  由 ui-workspace 注册，WorkspacePickFlow 内含「新建工作区」入口与目录流程），但工厂
  注入的 `selectWorkspace` 走 `openWorkspace` → `replaceMain('reveal')` →
  `layout.selectPanel(null)`——**会把主视图从工作台跳走**。工作台内嵌场景不能直接用。
- `uiWorkspace.pickDirectory()`（`Promise<string | null>`）是宿主原生目录选择弹窗；
  `ctx.workspaces.create({ path })` 注册工作区；`connectWorkspace(workspaceId)` 复用/新建
  该工作区的 blank 会话且**不导航**。三者拼起来就是「不离开工作台」的工作区指定+新建流程。
- `renderFactorySlot` 的 `options.slots` 可覆盖工厂子 slot（subagent 用 `views` 覆盖
  证明），因此工作台 composer 可以只渲染原生 InputBar：覆盖 `views` 为空组件（无消息流），
  传 `phase: 'active', hero: false`（无 hero 区），`variant: 'embedded'`。

#### 工作台 composer 最终形态

```
│ ┌─ 工作台 composer（指挥台 tab 底部常驻）──────────────────────┐ │
│ │ [工作区 ▾ v]                                  │ ＋新建… │  │ │
│ │ ┌───────────────────────────────────────────────────────┐│ │
│ │ │ 原生 InputBar（embedded，全能力：模型/附件/slash/@）    ││ │
│ │ └───────────────────────────────────────────────────────┘│ │
│ └──────────────────────────────────────────────────────────┘ │
```

1. **工作区选择器（仅存的自绘薄壳）**：下拉列出 `ctx.workspaces.list` 全部工作区
   （标题 + 路径），默认选中「最近活跃工作区」（复用 §11 的 recentWorkspaceOf 规则）；
   「＋新建…」按钮 → `pickDirectory()` 原生目录弹窗 → `workspaces.create({ path })` →
   自动选中新工作区。创建工作区失败/取消保持原选择。
2. **会话绑定**：选定工作区后 `connectWorkspace(workspaceId)` 拿 blank 会话
   （重复选择同一工作区幂等复用）→ `retain(source: 'workbenchComposer')` → 面板状态
    `composerSessionId` → `SessionProvider` 重绑。切换工作区释放旧引用再 retain 新的。
3. **原生 InputBar**：`renderFactorySlot('conversation.content',
   { variant: 'embedded', phase: 'active', hero: false },
   { slots: { views: () => null } })`——只有原生输入条，无消息流、无 hero。
   输入、发送、模型选择、附件、slash 指令全部是宿主原生行为。
4. **发送联动**：监听 composer 会话 `blank → false`（首条消息发出）→ 自动打开 §11.2
   的右侧抽屉显示同一会话的完整原生对话；用户后续在抽屉原生 InputBar 继续聊。
   原 v2.1 的 `sendPrompt`（自建 textarea + submit）整体退役，Composer.tsx 删除。
5. **无工作区兜底**：工作区列表为空且用户未选择时，InputBar 以 hero 冷启动形态渲染
   （`sessionId: undefined`，原生禁用态 + 「选择工作区」占位），用户在原生工作区 chip
   里选——但注意该路径的 selectWorkspace 会跳主视图（见上），所以兜底态优先引导用户
   用工作台自绘选择器；hero 原生选择器仅作展示冗余，不作为主路径。

#### 对 §11.2/§11.4 的修订

- §11.2 图中「✎ 工作台 composer（快速发送入口，保留）」替换为上述「工作区选择器 +
  原生 InputBar」结构；「发送后抽屉联动」改由 composer 会话 blank→false 触发，
  不再经过 sendPrompt。
- §11.4 实现清单更新：
  1. `index.ts`：main 注册 children 声明（drawer conversation + composer conversation
     两个 session-scope child）；`workbenchComposer` / `workbenchDrawer` 两个 retain
     source augmentation；工作区列表快照作为 hook 暴露。
  2. 新增 `ComposerConversation.tsx`：注册 `'workbench.composer.conversation'`，
     renderFactorySlot 固定 `{ variant: 'embedded', phase: 'active', hero: false }` +
     views 空覆盖。
  3. `WorkbenchPanel.tsx`：工作区选择器 UI（下拉 + 新建按钮）、composer 会话绑定状态机
     （选区 → connectWorkspace → retain → SessionProvider）、blank→false 监听开抽屉；
     删除 Composer.tsx 与 sendPrompt 接线。
  4. 抽屉部分按 §11.2 不变。
  5. locales + CSS + smoke 桩更新（renderFactorySlot / SessionProvider / workspaces 打桩）。
- 风险点（实现时验证）新增：① `phase: 'active'` 硬传对 blank 会话的副作用（InputBar
  高度量 --dsh-composer-height 的 ResizeObserver 依赖父滚动容器，工作台 composer 不是
  滚动容器，需要包一个最小占位）；② `views` 空覆盖后 `conversation.input.dock`
  （todo/queue dock）在 active phase 下是否渲染多余 UI，需要实测；③ connectWorkspace
  复用的 blank 会话被主视图同时打开时的草稿归属（原生 draft 恢复机制按 sessionId，
  行为应与主视图一致）。
