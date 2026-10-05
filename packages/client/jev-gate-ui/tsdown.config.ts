import { clientBundle } from '../tsdown.client.ts'

// 单阶段构建：不设 DSH_BUILD_FACE 时 client 入口直接吃 src/client/index.ts，
// 免去 tsc project-references 阶段（免做仓库级 lib/types 图）。
// libEntry 占位——preset 的 node 半总是构建，entry 为空会报错；node 半没有
// CSS 虚拟加载器，入口若碰到 .module.css 会被 tsdown 的 css-guard 拒掉，
// 所以占位入口选纯 TS 的 locales.ts。产物 lib/index.js 无用（运行扫描器只
// 消费 lib/client.js，由部署脚本拷到 jev-guard-plugin/lib/client.js——
// 宿主条目挂的是 jev-guard-plugin 的 manifest）。
export default clientBundle('jev-gate-ui', ['src/client/locales.ts'])
