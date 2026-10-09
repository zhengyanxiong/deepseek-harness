# Workbench 单包目录重组设计

[English](2026-10-08-workbench-directory-design.md) | 中文

状态：待用户审阅。本文是拟议目录，不描述已落地的结构。

## 目标与边界

保留 `workbench/` 这个独立 bundle、`src/index.ts` Host 入口、`src/client/index.ts` Client 注册入口、现有 `dsh-workbench` 标识与所有 slot 名称。仅移动文件、提取目前位于 `WorkbenchPanel.tsx` 的已被其他组件反向导入的纯类型与辅助代码、调整导入及测试路径；不改变 UI、命令执行、订阅、Session retain/release、草稿、文案或 CSS 规则。保留单份 `WorkbenchPanel.module.css`，避免目录调整同时引入样式差异。不为未来可能的插件预设接口或跨包依赖。

## 目录

```text
workbench/
├── src/
│   ├── index.ts                         # Host 入口
│   └── client/
│       ├── index.ts                     # 唯一 Client 注册、注入与生命周期入口
│       ├── WorkbenchPanel.tsx           # 页面组合与现有页面状态
│       ├── WorkbenchPanel.module.css    # 原样保留的单份样式
│       ├── WorkbenchIcon.tsx
│       ├── locales.ts                   # 字典与 key 类型
│       ├── shared/
│       │   ├── rows.ts                  # 跨区域展示行和提醒快照类型
│       │   ├── presentation.tsx         # Card、分页与其他跨区域展示辅助
│       │   └── format.ts                # 不依赖 React 的展示格式化
│       ├── command/
│       │   ├── CommandTab.tsx
│       │   ├── CommandPalette.tsx
│       │   └── commands.ts
│       ├── monitor/
│       │   ├── MonitorTab.tsx
│       │   └── DashboardCards.tsx
│       ├── operations/
│       │   ├── OperationForm.tsx
│       │   └── operations.ts
│       ├── conversation/
│       │   └── ConversationEmbed.tsx
│       ├── workspace/
│       │   ├── WorkspaceDirectoryDialog.tsx
│       │   └── WorkspaceDirectoryDialog.module.css
│       └── activity/
│           └── store.ts                 # 现有活动、趋势与命令 MRU 聚合
├── tests/                               # 现有测试按功能命名，不必同步建空目录
├── package.json
├── tsconfig.json
└── tsdown.config.ts
```

`shared/` 只接收已有的、由至少两个区域消费的类型或辅助代码。现有 `store.ts` 中活动、趋势、MRU 共用一个初始化点，此轮仅整体迁移；不拆为虚构的独立状态所有者。`WorkbenchPanel.tsx` 仍持有当前页面状态，`index.ts` 仍持有 Cordis 服务读取与注入动作。`WorkbenchPanel.module.css` 即使由子目录组件导入，也保持原路径和 CSS Modules 的类名来源；本轮不变更选择器、声明顺序或设计 token。

## 模块依赖方向

`src/client/index.ts` 组合 `WorkbenchPanel`、`ConversationEmbed`、`WorkbenchIcon` 和源服务；`WorkbenchPanel` 组合 command、monitor、operations、workspace 组件并使用 activity store；各功能目录只依赖本目录、`shared/`、`locales.ts` 及已声明的外部类型/组件。`monitor/DashboardCards.tsx` 定义的跨区域行类型移到 `shared/rows.ts`，`CommandTab` 和 `MonitorTab` 均从那里导入。`Card`、分页函数与无状态展示工具从 `WorkbenchPanel.tsx` 转移到 `shared/`；任何子模块不得反向导入 `WorkbenchPanel.tsx`，也不得从另一个功能目录取本应共享的通用定义。`index.ts` 仍是唯一注册 slot、绑定 locale 与获取 Cordis 服务的模块；展示组件不引入 `ctx` 或新的订阅机制。

## 迁移顺序与验证

1. 建立 `shared/rows.ts`、`shared/presentation.tsx` 和 `shared/format.ts`，迁出目前被其他组件引用的定义，并只改消费方 import；先验证 `WorkbenchPanel.tsx` 不再被功能区反向导入。
2. 按功能逐个移动文件，更新相对 import、CSS Modules 路径和 `index.ts` 入口导入；保持 `tsdown` 的 `client.js` 输出及现有独立包边界。
3. 调整测试的源文件路径；保留 `pnpm run typecheck`、`pnpm run build`、`node smoke.mjs`、现有 Vitest 交互测试、Node 操作测试和 Chromium 布局回归。对比迁移前后相同交互结果及单 bundle 注册行为；不以 jsdom 点击测试代替浏览器布局验证。
4. 检查 `src/client/` 中没有指向 `WorkbenchPanel.tsx` 的反向 import 或跨功能区循环 import；检查工作树只包含此次目录迁移的变更，并更新 workbench README 的实际目录说明。

验收条件：所有上述检查成功，默认收起/按需打开右侧区域与 Session 草稿行为保持不变；无需修改 profile 配置、slot 键、Client module id、Host 入口和外部 API。此文档获审阅后再写具体实施计划并执行迁移。
