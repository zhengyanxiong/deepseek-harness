# jev-gate-ui

jev-gate 安全门禁插件的浏览器配置卡片（Settings → Plugins → Plugin configuration）。

- 源码：`src/client/`（TSX + CSS Modules + 自有 staged form 复刻）
- 构建：在仓库根目录运行 `pnpm --dir packages/client/jev-gate-ui run bundle`，产物为本包的 `lib/client.js` 和 `lib/client.js.map`。
- DSH 主构建（`--env.DSH_BUILD_FACE host/client`）和开发监听（`watch`）均跳过本包；独立构建不要传入这些参数。
- 部署：把本包的 `lib/client.js` 和 `lib/client.js.map` 拷到仓库根目录的 `jev-guard-plugin/lib/`。运行时 client-modules 扫描器沿宿主条目 `jev-guard-plugin/src/gate.ts` 找到该插件的 `package.json`，按 `dsh.client` 声明和 `exports["./client"]` 提供 bundle。

## 编辑器类型检查

本包位于 pnpm workspace 的 `packages/*/*` 范围，但不参与 DSH 主构建。若本地缺少 React 及其类型，可在本包目录通过符号链接提供（不入库）：

```bash
mkdir -p node_modules/@types
ln -sfn ../../ui-plugin-manager/node_modules/react node_modules/react
ln -sfn ../../../ui-plugin-manager/node_modules/@types/react node_modules/@types/react
```

在本包目录运行 `tsc -b tsconfig.json` 可单独检查类型；独立打包直接读取源码，不执行此检查。
