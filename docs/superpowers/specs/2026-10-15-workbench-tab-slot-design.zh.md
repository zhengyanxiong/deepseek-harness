# Workbench Tab 插件化扩展槽设计

[English](2026-10-15-workbench-tab-slot-design.md) | 中文

状态：已确认，待实现。本文定义 workbench 面板的 tab 扩展槽契约与宿主改造，不包含首个消费方（项目管理插件）的设计。

## 目标与边界

让外部插件（如未来的项目管理包）能把一个 tab 页注入 workbench 面板的 SegmentedTabs，并渲染该 tab 的页面内容，而无需修改 workbench 代码或跨包 import。本设计只交付 workbench 侧的槽改造与契约文档；首个消费插件是独立任务。不改变现有 command / monitor 两个内置 tab 的任何行为、UI 或数据流；命令面板的 `switchTab` 仍只面向内置 tab。

## 槽契约

`workbench` 包在 SlotMap 声明一个 list 槽：

```ts
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'workbench.tab': { kind: 'list'; scope: 'root'; owner: WorkbenchTabOwnerProps }
  }
}
```

- `owner: { active: boolean }`：唯一 owner prop。内容渲染位恒传 `true`；保留该字段供未来在页签位渲染角标等场景复用。
- 注册形如 `ctx.slots.inject('workbench.tab', () => ctx.slots.register({ name: 'workbench.tab', id: 'projects', order: 300, label: () => t('tab') }, ProjectsTabBody))`：
  - `id`：tab 值（string），即 `WorkbenchTab` 的动态成员，同时是内容渲染 `renderSlot` 的 `only` 过滤键。
  - `order`：升序排位，同序号保持注册顺序。约定 `command`=100、`monitor`=200 为内置固定值，插件 ≥ 300；该区间是文档约定，不做运行时校验（与 sidebar.panellist 的宽松约定一致）。
  - `label`：thunk 跟随活动 locale，框架 `resolveSlotLabel` 现成支持。
- 内容组件获得五份 props：owner `active`、全局标准座位（`t` 需声明自己的 locale 命名空间）、以及自己注册声明的 inject 面。同一注册同时声明页签元数据与内容组件，与 `sidebar.panellist` 的 `id` ↔ MainPanelId 对应模式同构。

## 宿主改造（WorkbenchPanel 与 apply）

- `WorkbenchTab` 从封闭联合 `'command' | 'monitor'` 放宽为 `string`；`useState` 初值仍 `'command'`。
- `main` 注册的 `children` 声明表新增 `'workbench.tab': { kind: 'list', scope: 'root' }`（声明即授权渲染）。
- apply 侧构造 tab 元数据快照：`ctx.slots.entriesOfSlot('workbench.tab')` → 映射 `{ id, order, label: resolveSlotLabel(...) ?? id }` → 按 `order` 升序排序 → 存入 snapshot store，`ctx.slots.subscribe('workbench.tab', sync)` 与 `ctx.locale.subscribe(sync)` 驱动重算。此做法与 ui-sidebar 消费 `sidebar.panellist` 的现成模式完全同构。
- 该快照经 `main` 注册的 `inject.hooks.tabEntries`（ObservableSnapshot）进组件，渲染器绑定为 `useTabEntries`。
- tablist items 合成：内置两项（`wb-tab` / `wb-tab-2` 现有 DOM id 不变）+ 插件项（DOM id `wb-tab-<id>`，SegmentedTabs 要求唯一 id 与 value）。
- 内容渲染：`tab` 为内置值时走现有 command / monitor 分支；否则 `renderSlot('workbench.tab', { active: true }, { only: tab })`。
- 右侧面板互斥：操作表单 / 任务详情 / 抽屉的渲染前置条件保持 `tab === 'command'` 不动；插件 tab 全宽展示，不共享右侧面板。

## 命令面板联动

`switchTab: 'command' | 'monitor'`（command/commands.ts）保持不变，命令面板只跳内置 tab。等真有插件需要"跳转到我的 tab"时再给槽 owner 加 `switchTo` 回调（一行改动），现在不做（YAGNI）。

## 错误处理

- 槽未声明或无注册时 `entriesOfSlot` 返回空数组，tablist 仍为内置两项——零 UI 变化，无需兜底分支。
- 插件 tab 被选中时其注册被卸载：快照重算后 tablist 少一项，选中态回落到 `'command'`（宿主在 sync 后校验当前 tab 是否仍存在于 items，不存在则复位）。
- 插件内容组件崩溃：走框架 entry 边界错误上报（`reportEntryError`），不影响宿主面板其余部分。

## 验证

- `operation-panel.spec.tsx` 新增两例：注册一个假 tab 后 tablist 出现第三项且按 order 排位；点击该 tab 后插件 body 渲染、command 的右侧操作面板不出现、切回 command 后恢复。
- 现有 28 例交互测试、smoke、布局回归、import-direction、oxlint 全部不回归。
- 槽改造在无插件注册时零 UI 变化，浏览器布局回归跑通即可。
- 契约文档：SlotMap 声明的 JSDoc 写全注册示例（参照 `sidebar.session.row.hover` 的写法）；workbench README 扩展章节补"如何加一个 tab"。
