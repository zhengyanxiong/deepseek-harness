import { expect, it } from 'vitest'
import { clampSize, nextSize } from '../src/client/LoomResizeHandle.tsx'
it('clamps pane sizes to the accepted interval', () => {
  expect(clampSize(100, 220, 720)).toBe(220)
  expect(clampSize(500, 220, 720)).toBe(500)
  expect(clampSize(900, 220, 720)).toBe(720)
  expect(clampSize(500, 720, 220)).toBe(720)
})
it('grows a right or bottom pane when the pointer moves away from it', () => {
  expect(nextSize(480, -80, true, 300, 960)).toBe(560)
  expect(nextSize(170, 40, true, 80, 600)).toBe(130)
  expect(nextSize(480, -80, false, 300, 960)).toBe(400)
})
