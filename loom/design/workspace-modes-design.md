# Workloom 工作区形态与历史数据迁移设计

状态：设计稿，待实现。
目标：单仓/多仓、已有目录/新建目录都能工作；工作区可跨任务、跨版本复用；运行中会话与未提交改动有硬约束；不要求 DSH 支持多个工作根。

## 1. 已确定的决策

1. 工作区在文件系统中真实存在，DSH 会话 cwd 就是工作区根目录。
2. 工作区可以跨任务、跨版本复用；工作区属于项目，不再硬绑定某个版本。
3. 工作区存在运行中的会话时，禁止另一个任务启动。
4. 复用、同步、启动前，工作区所有仓库必须已提交，工作区必须干净。
5. 多仓分散目录使用 junction/软链接接入 Loom 创建的工作区根。
6. linked 工作区使用 `danger-full-access`（A 方案）；managed/direct 工作区继续使用 `workspace-write`。
7. Loom 只检查和提示提交，不自动 commit。
8. 同一真实目录只允许一个未清理的工作区记录；跨版本接管时复用已有工作区记录或先清理，不创建重复记录。

## 2. 数据模型 v2

```ts
type WorkspaceMode = 'managed' | 'direct' | 'linked'
type WorkspaceRepositoryKind = 'worktree' | 'direct' | 'link'

interface WorkspaceRepositoryBinding {
  sourceId: string
  /** 工作区内的相对路径；单仓 direct 为 "." */
  path: string
  /** 真实物理目录；managed 为 root/path，link 为链接目标 */
  targetPath: string
  kind: WorkspaceRepositoryKind
  branch?: string
}

interface WorkspaceRecordV2 {
  id: string
  projectId: string
  title: string
  mode: WorkspaceMode
  /** 工作区根，始终是真实存在的目录 */
  rootPath: string
  rootOwner: 'loom' | 'user'
  repositories: WorkspaceRepositoryBinding[]
  /** 仅展示/审计，不再作为硬约束 */
  lastVersionId?: string
  lastLockId?: string
  cleaned?: boolean
}
```

约束：

- `rootPath` 必须是绝对路径，且存在；
- `repositories` 必须覆盖项目全部 source，`sourceId` 不重复；
- `path` 不允许 `.`/`..`/反斜杠/冒号，且互相不重叠；
- `kind=link` 的 `targetPath` 必须存在且是 Git 仓库；
- `rootOwner=user` 的工作区，Loom 不删除 root 及目标目录；
- linked 工作区的 `rootPath` 由 Loom 创建，目标是用户已有目录。

Attempt v2：

```ts
interface AttemptV2 {
  id: string
  workspaceId: string
  requestedVersionId: string
  requestedLockId: string
  /** 启动时每个仓库的真实 HEAD */
  baseline: { sourceId: string; commit: string }[]
  sessionIds: string[]
  status: TaskStatus
}
```

旧 `Attempt.lock` 保留为兼容字段；新 Attempt 以 `baseline` 计算 Diff。

## 3. 四种工作区

### managed

```text
rootPath: E:\loom-workspaces\iems\vn_balance
repositories:
  back   worktree -> E:\loom-workspaces\iems\vn_balance\back
  common worktree -> E:\loom-workspaces\iems\vn_balance\common
```

- Loom 创建 root，并从版本 Lock 创建真实 worktree；
- 默认分支 `loom/<workspace-slug>/<source-id>`；
- 清理：`git worktree remove` 后删除 root；
- 沙箱：`workspace-write`。

### direct-single

```text
rootPath: E:\repo\logistics-worktree\vn_balance
repositories:
  back direct path="." target=E:\repo\logistics-worktree\vn_balance
```

- 不创建目录，不加一层；
- 清理只解除绑定。

### direct-multi

```text
rootPath: E:\repo\logistics-worktree
repositories:
  back   direct path="vn_balance" target=E:\repo\logistics-worktree\vn_balance
  common direct path="common"     target=E:\repo\logistics-worktree\common
```

- 用户指定共同父目录，不创建目录；
- 清理只解除绑定；
- 注意：cwd 是父目录时，DSH `workspace-write` 可写父目录下的所有内容，不只选中的仓库；UI 需要明确提示这个范围。

### linked-multi

```text
rootPath: E:\loom-workspaces\iems\vn_balance
repositories:
  back   link path="back"   target=E:\repo\logistics-worktree\vn_balance
  common link path="common" target=E:\repo\common-worktree\vn_balance
```

- Loom 创建 root，并在 root 下建立 junction/符号链接；
- 目标目录不复制、不移动；
- 清理只删除链接和 root，绝不删除目标；
- 沙箱：`danger-full-access`（A 方案），UI 必须显示明确警告；
- Windows 优先 `fs.symlink(..., 'junction')`，跨盘/网络盘先探测。

## 4. 改动点

### 领域与 wire 类型

| 文件 | 改动 |
|---|---|
| `loom/src/domain/project.ts` | `SourceConfig.path` 从必填改为可选/弃用；解析器接受旧格式但新逻辑不再把它用于 Lock 或目录拼接；新增 workspace 布局类型 |
| `loom/src/domain/task.ts` | `startAttempt` 去掉 `workspace.versionId/lockId === task.version/lock` 硬校验；Attempt 增加 `requestedVersionId/requestedLockId/baseline`；新增“实际基线 vs 期望基线”的只读状态 |
| `loom/src/domain/workspace.ts` | 新文件：`WorkspaceMode`、`WorkspaceRepositoryBinding`、布局校验、路径重叠校验、模式不变量 |
| `loom/src/domain/execution.ts` | 保持 owner/waiting 语义；启动互斥只查 execution，不再查 task.status |
| `loom/src/types.ts` | 新请求/响应：创建 managed/direct/linked 工作区、逐仓库 inspect、注册已有目录、同步基线、提交状态；`WorkspaceChangesRequest` 增加 attemptId；`WorkspaceRecord` 切到 v2 |

### Host / catalog

| 文件 | 改动 |
|---|---|
| `loom/src/host/catalog.ts` | `workspaceSchema` v2；`prepareWorkspace` 接收 mode + 布局；`registerPreparedWorkspace` 接收 bindings；`startAttempt` 只查 execution owner/waiting；`workspaceChanges` 按 Attempt baseline；`cleanupWorkspace` 按 mode/rootOwner 分支；`deleteVersion` 去掉 `version_has_workspaces` 限制；`temporarySessions` 从 path 迁到 workspaceId；接管目录复用已有 root 记录 |
| `loom/src/host/service.ts` | 启动前 clean + owner 检查；`workspaceChanges/status` 透传 attemptId；`registerWorkspace` 接收 bindings；`session/created` 对 linked 会话追加 `sandbox/mode = danger-full-access`；`agent/created` 用 `ctx.systemPrompt.context` 注入仓库映射与技能位置 |
| `loom/src/git/workspace.ts` | `prepareWorkspace` 支持单仓 direct、父目录 direct、linked 容器；实现 junction/软链接创建、清理、目标校验；新增按 bindings 的 `workingTreeStatus` / `inspect` |
| `loom/src/storage/json-store.ts` + `loom/src/host/catalog.ts` | 支持 schema v1 → v2 显式迁移；`migrateCatalog` 只补字段、不探测文件系统；迁移失败启动失败 |
| `loom/scripts/migrate-catalog.ts` | 一次性迁移脚本：备份原文件、写 v2、输出计数、幂等 |

### Client

| 文件 | 改动 |
|---|---|
| `loom/src/client/LoomExecution.tsx` | 开始执行改为项目池 + managed/direct/linked 新建；池不按 versionId 过滤；仅 execution owner 阻止；跨版本复用必须勾选确认；开始后登记 execution owner |
| `loom/src/client/LoomForms.tsx` | 保留项目仓库相对路径（用于 managed 多仓布局），分支输入支持手动输入 + 本地分支搜索 |
| `loom/src/client/LoomContextPanel.tsx` | 工作区详情：root、mode、repositories、target、Lock；去掉与 DSH 原生 Git 面板重复的分支信息 |
| `loom/src/client/LoomPanel.tsx` | 模态框/流程接线；新建工作区入口；错误提示；删除/清理确认 |
| `loom/src/client/index.ts` | `createSessionInWorkspace` 保持只传真实 path；Host 在 `session/created` / `agent/created` 注入 sandbox mode 与仓库上下文 |
| `loom/src/client/locales.ts` | 新增四模式、绑定、dirty、owner、full-access 警告、基线偏离等中英文案 |
| `loom/src/client/LoomKanban.tsx` | 执行中卡片按 live session 数量播放脉冲动画；`prefers-reduced-motion` 时关闭 |
| `loom/README.md` | 更新工作区模型、四种模式、full-access 约束、提交要求 |

### 测试

- catalog 迁移 v1 fixture → v2，字段完整、幂等、损坏输入 fail loud；
- managed/direct-single/direct-multi/linked 四种创建、复用、清理；
- linked 清理绝不能删除目标；junction/软链接失效处理；
- 运行中 owner 阻止启动；task.status 不再阻止；
- 未提交任一仓库阻止复用/同步/启动；
- 跨版本复用基线偏离提示；同步要求 clean；
- Diff 用 Attempt baseline，不把上一个任务改动算进来；
- 客户端：项目池、模式向导、dirty/owner、full-access 警告、390px 布局；
- i18n gate。

## 5. UI 原型

见 `loom/design/prototype/workspace-modes.html`。三块：

1. 开始执行：项目池、运行中/未提交状态、新建入口；
2. 新建工作区：四种模式、逐仓库映射、预览；
3. 工作区详情：root、mode、仓库绑定、基线、owner。

设计约束（`dsh-client-ui-ux` / `dsh-responsive-ui`）：

- 复用 `Button`、`SegmentedControl`、`Menu`，不新造视觉语言；
- 白色面板、蓝色 primary、字体权重不超过 500；
- 运行中不给“不可选”的空状态，而是可选中 + 提交时给出 owner 和操作；
- 未提交用 inline notice，不吞错误；
- linked 的 full-access 是显式警告，不是默认静默；
- 390px：映射表变堆叠卡片，路径可换行，主操作保留；
- 图标按钮有 tooltip，不以 hover 作为唯一发现方式。

## 6. Skills 设计

这里有两层，必须分开：

### UI 设计 skill

- 按 `dsh-client-ui-ux`：复用现有组件与 token、反馈位置、overlay 安全、双主题可读性；
- 按 `dsh-responsive-ui`：390px 验收、表格堆叠、标题换行、主操作不隐藏；
- 不新增图标；需要时从现有 icon 库选，icon-only 加 tooltip。

### 工作区技能可见性

DSH 的 `skill-filesystem` 以 cwd 最近的 `.git` 祖先作为项目根：

- `direct-single`：cwd 就是仓库根，项目 skills 可以按仓库发现；
- `managed`、`direct-multi`、`linked-multi`：cwd 是工作区根，通常不是 Git 仓库，只会扫描 `<root>/.dsh/skills`，仓库内的 `.dsh/skills` / `.agents/skills` 发现不到。

已实现：

1. `managed` 多仓与 `linked` 容器在根目录创建 `.dsh/skills`，按仓库前缀链接各仓库的 `.dsh/skills` 和 `.agents/skills` 条目；
2. `direct` 不修改用户目录，由 `agent/created` 的 `systemPrompt.context` 列出每个仓库的真实路径和技能目录；
3. 清理 linked 时先删除 Loom 自己的 `.dsh` 聚合层，再删除容器；不会碰真实仓库；
4. 仍待补：工作区详情显示“当前会话加载的技能 / 未加载的技能”，以及 flat Markdown 技能在 Windows 上无符号链接权限时的降级。

## 7. 历史数据

### Loom catalog：需要迁移

`loom/catalog.json` 当前 envelope 为 `version: 1`。新模型需要 `version: 2`。

迁移规则：

- 旧 `workspaces[].path` 作为 `rootPath`；
- 旧 `project.config.sources[].path` + root 推导每个仓库的 `targetPath`；
- 旧 `managed === true` → `mode='managed'`、`rootOwner='loom'`、`kind='worktree'`；
- 旧 `managed !== true` → `mode='direct'`、`rootOwner='user'`、`kind='direct'`；
- 旧 `versionId` / `lockId` → `lastVersionId` / `lastLockId`，仅展示；
- 旧 `branches` 迁到对应 binding 的 `branch`；
- 旧 `cleaned === true` 保留；不因为目录已不存在而删除记录；
- 旧 tasks/attempts 保留 `lock`，同时补 `requestedVersionId=task.versionId`、`requestedLockId=attempt.lock.id`、`baseline=attempt.lock.repositories`；
- `temporarySessions.workspacePath` 按 rootPath 匹配迁到 workspaceId；匹配不到时保留 path 兼容读取；
- 不移动、不删除任何用户目录；迁移只改 catalog 数据。

安全要求：

- 迁移前写 `catalog.v1.json` 备份；
- 原子写；迁移失败保留原文件并报错；
- 幂等：已是 v2 不重复迁移；
- 迁移不探测文件系统，避免离线路径导致启动失败。

### DSH session 数据

- 不需要改 session format；
- 旧会话保留原 cwd 和原 sandbox mode；
- 新建 linked 工作区会话追加 `sandbox/mode = danger-full-access` 事件；
- 不重写历史 session。

### 项目导入/导出

- 旧格式带 `source.path` 仍可导入，转成兼容的默认布局；
- 新导出使用 v2 格式；
- 读取旧配置不报错，但 UI 不再把 project 的相对目录当作 Lock 输入。

## 8. 实施顺序

1. 领域类型 + catalog v2 + 迁移 + 测试；
2. managed / direct-single / direct-multi 的创建、复用、清理；
3. 启动互斥、干净检查、Attempt baseline、Diff；
4. linked-multi + full-access + 链接安全；
5. 客户端流程与 UI；
6. skills 聚合与提示上下文；
7. README、i18n、回归测试。

## 9. 风险

- linked 模式依赖 full-access，必须让用户显式确认；不能悄悄放宽沙箱。
- Windows junction/符号链接的权限、跨盘符行为需要实机验证。
- 旧 catalog 中的路径可能已经不存在；迁移不能做文件系统探测，UI 必须能显示“目标缺失”。
- 工作区项目池会改变版本删除/工作区清理语义，必须同步更新删除校验和测试。


## 10. 当前实现状态（2026-10-21）

已落地：

- `WorkspaceRecord` v2 字段与 `admitWorkspaceLayout` 校验；`managed`、`direct`、`linked` 三种模式。
- `managed` 单仓默认把 worktree 直接放在工作区根目录（binding path `.`），不再强制多一层 `back/`；多仓仍按项目 source 相对目录。
- `direct` 单仓 binding `.`；多仓以共同父目录为 root，按真实子目录映射。
- `linked` 用 junction/软链接创建容器；清理只删除 Loom 创建的链接、`.dsh` 聚合层和容器。
- 项目工作区池：不按版本过滤；复用前检查 execution owner 和未提交改动；跨版本复用必须显式勾选确认。
- `startAttempt` 以各 binding 的实际 `HEAD` 作为本次 Attempt 的 Lock 基线；同一 `versionId + commits` 才复用旧 Lock，否则写入合成 Lock。
- Diff 通过 `attemptId` 使用 Attempt 基线；右侧上下文不再重复原生 Git 分支。
- 只有 execution owner 阻止开始；任务状态 `running` 本身不阻止。
- linked 会话在 `session/created` 追加 `danger-full-access`；managed/direct 保持部署默认。
- 多仓容器技能聚合；所有工作区通过 `systemPrompt.context` 获得仓库真实路径映射。
- Lock 解析失败时从默认远端 fetch 一次。
- `scripts/migrate-catalog.ts` 提供 v1 → v2 迁移，自动备份。
- Diff 不再调用不存在的 DSH `deliverables.fileDiff` factory，改由 Loom 渲染统一 diff；文件预览增加文字缩放和“用默认应用打开”。
- 工作区上下文为每个仓库提供“打开”，多仓时不必只打开容器根目录。
- Kanban 执行中卡片脉冲动画；版本编辑弹窗去掉重复标题。
- 单元测试 223 个通过（32 个文件）。

待实机验证：

- Windows junction / 文件符号链接权限和跨盘符行为；
- GUI 390px 宽度下的池、映射表、清理弹窗；
- 真实 DSH profile 中 linked 会话的 sandbox mode 事件与原生 Diff Factory 是否已加载；
- 工作区详情页（目前信息在 StartForm / 上下文面板，尚无独立管理页）；
- direct-multi 的 `.dsh/skills` 不聚合，依赖 prompt 提示，需确认实际技能可读。
