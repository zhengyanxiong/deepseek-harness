import { clientBundle } from '../tsdown.client.ts'

// 单阶段构建：不设 DSH_BUILD_FACE 时 client 入口直接吃 src/client/index.ts，
// 免去 tsc project-references 阶段（免做仓库级 lib/types 图）。
// libEntry 给真实文件占位——preset 的 node 半总是构建，entry 为空会报错；
// 产物 lib/index.js 无用（运行扫描器只消费 lib/client.js，由部署脚本拷到
// jev-guard-plugin/lib/client.js——宿主条目挂的是 jev-guard-plugin 的 manifest）。
export default clientBundle('jev-gate-ui', ['src/client/index.ts'])
