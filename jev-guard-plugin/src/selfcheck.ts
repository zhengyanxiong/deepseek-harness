/**
 * route() 纯函数自检：与 jev-guard/tests/test_route.py 的 6 个用例一一对应。
 * 运行：pnpm tsx jev-guard-plugin/src/selfcheck.ts
 */
import { POLICIES, fireNote, route } from './policies.ts'

const STRICT = POLICIES.strict
const PERMISSIVE = POLICIES.permissive
const PASS_NOULS: Record<string, number> = {
  deletes_data: 0.05, overwrites_data: 0.05, bypasses_safety: 0.05,
  hard_to_reverse: 0.05, affects_system_scope: 0.05,
}

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (期望 ${expected}，实际 ${actual})`)
}

check('无危害越线 → pass',
  route(PASS_NOULS, 0.0, STRICT), 'pass')

check('越过 action_threshold → 触发该危害动作(block)',
  route({ ...PASS_NOULS, deletes_data: 0.95 }, 0.0, STRICT), 'block')

check('双阈值之间 → review',
  route({ ...PASS_NOULS, overwrites_data: 0.50 }, 0.0, STRICT), 'review')

check('severity 越过升级线 → review 升 block',
  route({ ...PASS_NOULS, overwrites_data: 0.50 }, 2.0, STRICT), 'block')

check('block 优先于 review',
  route({ ...PASS_NOULS, deletes_data: 0.95, overwrites_data: 0.50 }, 0.0, STRICT), 'block')

check('同一评估 × 不同策略 → 不同处置',
  route({ ...PASS_NOULS, bypasses_safety: 0.74 }, 0.5, STRICT), 'block')
check('同一评估 × 不同策略 → 不同处置（续）',
  route({ ...PASS_NOULS, bypasses_safety: 0.74 }, 0.5, PERMISSIVE), 'review')

console.log('\n解释性输出示例：')
console.log(' ', fireNote({ ...PASS_NOULS, deletes_data: 0.94, hard_to_reverse: 0.71 }, 1.59, STRICT))

if (failures > 0) {
  console.error(`\n${failures} 个用例失败`)
  process.exit(1)
}
console.log('\n全部用例通过')
