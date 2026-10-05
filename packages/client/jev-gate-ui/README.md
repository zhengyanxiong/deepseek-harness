# jev-gate-ui

jev-gate 安全门禁插件的浏览器配置卡片（Settings → Plugins → Plugin configuration）。

- 源码：`src/client/`（TSX + CSS Modules + 自有 staged form 复刻）
- 构建：`pnpm bundle`（或 `../../../node_modules/.bin/tsdown`）→ 产物 `lib/client.js`
- 部署：把 `lib/client.js`（和 `.map`）拷到 `../../jev-guard-plugin/lib/`——
  运行时 client-modules 扫描器沿宿主条目（`jev-guard-plugin/src/gate.ts`）向上找
  最近的 `package.json`（即 `jev-guard-plugin/package.json` 的 `dsh.client` 声明），
  从它的 `exports["./client"]` 提供 bundle。

## 编辑器类型检查

本包不在 pnpm workspace 内，react 及其类型经符号链接提供（不入库）：

```bash
mkdir -p node_modules/@types
ln -sfn ../../ui-settings-plugins/node_modules/react node_modules/react
ln -sfn ../../../ui-settings-plugins/node_modules/@types/react node_modules/@types/react
```

`tsc -b tsconfig.json` 应零错误（project references 接到 locale/cordis/store/
ui-settings/ui-settings-plugins/ui-renderer/ui-slots）。
