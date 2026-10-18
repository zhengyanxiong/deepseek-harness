# Workloom（织）

**Workloom 是 DeepSeek Harness 的多项目工作台插件。** 它把项目、版本、Lock、任务、Git 工作区和原生 Agent 会话组织到同一个界面里，让多个仓库的并行开发不再依赖临时脚本和手工切换目录。

Workloom 复用 DSH 原生的会话、Diff、输入框、模型选择、审批、工具和权限体系；它不替代 DSH，也不修改你的 DSH 安装。

[English](#english) · [实现状态与 TODO](https://github.com/zhengyanxiong/deepseek-harness/blob/feature/dsh-loom/loom/TODO.md)

## 它能做什么

- **多项目管理**：一个工作台管理多个项目，每个项目可以包含多个本地 Git 仓库和业务模块。
- **版本与 Lock**：版本记录每个仓库的分支、标签或提交；生成 Lock 时固定到精确 commit，之后所有任务都基于同一份不可变基线。
- **任务与工作区**：任务绑定版本，启动执行时从 Lock 物化独立工作区；工作区可以跨多轮 Session 复用，并保留自己的分支。
- **原生 Agent 会话**：在任务工作区内启动 DSH 原生会话，继续使用原生工具、审批、模型选择和上下文压缩。
- **Diff 与验收**：对照 Lock 查看工作区改动、未跟踪文件、未推送提交，并按任务状态流转。
- **执行权**：同一工作区同时只允许一个 Agent 执行；支持等待、显式接管和释放，避免两个会话同时改同一份代码。
- **审计与用量**：Activity 面板记录项目、版本、任务、Lock、工作区和执行操作；Usage 面板展示 DSH 原生 token 统计。
- **可编辑**：项目、版本、任务创建后可以继续修改；编辑会保留内部 repository/module id，避免旧版本、Lock 和任务失联。

## 安装

要求：

- DeepSeek Harness `>=0.2.1-rc.2 <0.3.0`
- Node.js `>=22.19`

从 npm 安装：

```bash
dsh plugin --profile web add dsh-workloom@0.1.5
dsh --profile web
```

Desktop：

```bash
dsh plugin --profile desktop add dsh-workloom@0.1.5
```

然后重启 DSH。Web 端仅刷新浏览器不够，Host 和 Client 都需要重新加载插件。

> 本机如果配置了只读镜像（例如 `registry.npmmirror.com`），镜像可能尚未同步新版本。安装时临时使用官方 registry：
>
> ```bash
> npm_config_registry=https://registry.npmjs.org dsh plugin --profile web add dsh-workloom@0.1.5
> ```

## 快速开始

1. **新建项目**：填写项目名，添加一个或多个本地 Git 仓库；仓库使用绝对路径，工作区相对目录不能重叠。
2. **新建版本**：为每个仓库填写分支、标签或 commit。Workloom 不会自动 fetch，ref 必须已经在本地存在。
3. **生成 Lock**：把版本 ref 解析成精确 commit。如果 Git 无法读取仓库，界面会显示具体路径和 Git 的错误信息。
4. **新建任务**：选择版本、优先级和涉及模块，描述这次要完成的工作。
5. **开始执行**：指定工作区目录，Workloom 从 Lock 创建工作区并启动原生 Session。
6. **查看 Diff、验收、清理**：工作区有未提交改动或未推送提交时，清理会要求二次确认。

## 核心概念

| 概念 | 含义 |
| --- | --- |
| Project | 一个业务项目和它包含的本地 Git 仓库、模块 |
| Version | 每个仓库的一组 ref，表示一个待开发版本 |
| Lock | Version ref 解析后的精确 commit 集合，不可变 |
| Task | 在某个 Version 上执行的一项工作 |
| Workspace | 从 Lock 物化出来的工作区，可跨 Session 复用 |
| Attempt | 任务的一轮执行，记录 Session、工作区和状态 |
| Execution | 当前工作区的执行所有权，含 FIFO 等待和交接 |

## 兼容性与限制

- 当前只支持**本地 Git 仓库**；不支持远程 clone、Git URL 或跨机器工作区。
- Lock 创建**不会自动 fetch**；请先在本地拉取所需分支或标签。
- Git 调用会禁用用户级和系统级配置及 hooks，但会为当前仓库路径显式传入 `safe.directory`，以兼容 Windows 或不同账户下的目录所有者检查。
- Workloom 的执行权只约束 DSH 托管的 Agent 调用；外部编辑器和终端仍可修改工作区文件。
- 终止确认观察的是 Agent 状态，不是所有子进程或外部进程。
- Terminal、测试面板尚未接入原生或外部数据源。
- 当前为早期预览版本，接口和数据格式仍可能变化；升级前请备份 `$DSH_HOME/loom`。

## 开发

```bash
cd loom
pnpm install
pnpm run build
pnpm exec vitest --config vitest.config.ts run
npm pack
```

生成的文件在 `lib/`，不要手工编辑；TypeScript 源码在 `src/`。

## English

**Workloom is a multi-project workbench for DeepSeek Harness.** It organizes projects, Git-backed versions, immutable Locks, tasks, isolated workspaces and native Agent sessions in one workbench, reusing DSH's native conversation, Diff, composer, model, approval, tool and permission surfaces.

Highlights:

- Multiple projects, repositories and business modules in one workbench.
- A version pins refs per repository; a Lock resolves them to exact commits.
- Tasks materialize isolated Git worktrees from a Lock and reuse them across Sessions.
- Native DSH Sessions run inside a task workspace with the usual tools and approvals.
- Workspace ownership allows one Agent at a time, with waiting, takeover and release.
- Durable audit history and native token usage reporting.
- Projects, versions and tasks remain editable after creation.

Requirements: DSH `>=0.2.1-rc.2 <0.3.0`, Node.js `>=22.19`.

```bash
dsh plugin --profile web add dsh-workloom@0.1.5
dsh --profile web
```

Workloom currently supports local Git repositories only, does not fetch missing refs during Lock creation, and remains an early preview. See [TODO](https://github.com/zhengyanxiong/deepseek-harness/blob/feature/dsh-loom/loom/TODO.md) for remaining work.

## License

MIT
