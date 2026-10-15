# Workbench Tab Extension Slot Design

English | [中文](2026-10-15-workbench-tab-slot-design.zh.md)

Status: confirmed, pending implementation. This document defines the workbench panel's tab extension slot contract and host changes. The design of the first consumer (the project-management plugin) is a separate task.

## Goals and Scope

Let an external plugin (such as a future project-management package) inject a tab into the workbench panel's SegmentedTabs and render that tab's page content, without modifying workbench code or importing across packages. This design delivers only the workbench-side slot changes and contract documentation; the first consuming plugin is a separate task. It changes no behavior, UI, or data flow of the existing built-in command / monitor tabs, and the command palette's `switchTab` still targets only built-in tabs.

## Slot Contract

The `workbench` package declares one list slot in the SlotMap:

```ts
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'workbench.tab': { kind: 'list'; scope: 'root'; owner: WorkbenchTabOwnerProps }
  }
}
```

- `owner: { active: boolean }` is the only owner prop. The content render site always passes `true`; the field remains for future reuse such as badges on the tab strip.
- A registration looks like `ctx.slots.inject('workbench.tab', () => ctx.slots.register({ name: 'workbench.tab', id: 'projects', order: 300, label: () => t('tab') }, ProjectsTabBody))`:
  - `id`: the tab value (string), the dynamic member of `WorkbenchTab`, and the `only` filter key for content rendering via `renderSlot`.
  - `order`: ascending placement; ties keep registration order. `command`=100 and `monitor`=200 are fixed built-in values and plugins use ≥ 300; the range is a documentation convention with no runtime validation (matching the loose convention of sidebar.panellist).
  - `label`: a thunk following the active locale, supported by the framework's `resolveSlotLabel`.
- The content component receives the five prop shares: the owner `active`, the global standard seats (`t` requires declaring its own locale namespace), and the inject face of its own registration. One registration declares both the tab metadata and the content component, mirroring the `sidebar.panellist` `id` ↔ MainPanelId correspondence.

## Host Changes (WorkbenchPanel and apply)

- `WorkbenchTab` widens from the closed union `'command' | 'monitor'` to `string`; the `useState` initial value stays `'command'`.
- The `main` registration's `children` declaration table gains `'workbench.tab': { kind: 'list', scope: 'root' }` (declaring authorizes rendering).
- The apply side builds a tab metadata snapshot: `ctx.slots.entriesOfSlot('workbench.tab')` → map to `{ id, order, label: resolveSlotLabel(...) ?? id }` → sort ascending by `order` → store in a snapshot store, with `ctx.slots.subscribe('workbench.tab', sync)` and `ctx.locale.subscribe(sync)` driving recomputation. This is exactly the pattern ui-sidebar uses to consume `sidebar.panellist`.
- The snapshot reaches the component through `inject.hooks.tabEntries` (ObservableSnapshot) of the `main` registration; the renderer binds it as `useTabEntries`.
- Tablist item composition: the two built-in entries (existing DOM ids `wb-tab` / `wb-tab-2` unchanged) plus plugin entries (DOM id `wb-tab-<id>`; SegmentedTabs requires unique ids and values).
- Content rendering: built-in `tab` values take the existing command / monitor branches; otherwise `renderSlot('workbench.tab', { active: true }, { only: tab })`.
- Right-panel exclusivity: the render preconditions for the operation form / job detail / drawer keep `tab === 'command'` unchanged; a plugin tab renders full-width and does not share the right panel.

## Command Palette Linkage

`switchTab: 'command' | 'monitor'` (command/commands.ts) is unchanged; the command palette jumps only to built-in tabs. When a plugin actually needs "jump to my tab", add a `switchTo` callback to the slot owner (a one-line change); not done now (YAGNI).

## Error Handling

- When the slot is undeclared or has no registrations, `entriesOfSlot` returns an empty array and the tablist stays at the two built-in entries — zero UI change, no fallback branch needed.
- If a selected plugin tab's registration is removed: the recomputed snapshot loses that entry and the selection falls back to `'command'` (the host validates after sync that the current tab still exists among the items and resets otherwise).
- If a plugin content component crashes: the framework's entry boundary error reporting (`reportEntryError`) handles it, without affecting the rest of the host panel.

## Verification

- Two new cases in `operation-panel.spec.tsx`: after registering a fake tab, the tablist shows a third entry placed by order; clicking it renders the plugin body, keeps the command right operation panel hidden, and restores state when switching back to command.
- All existing 28 interaction tests, smoke, layout regression, import-direction, and oxlint stay green.
- With no plugin registered the slot change is zero-UI; the browser layout regression passing is sufficient.
- Contract documentation: the SlotMap declaration's JSDoc carries a complete registration example (following the style of `sidebar.session.row.hover`), and the workbench README's extension section gains a "how to add a tab" guide.
