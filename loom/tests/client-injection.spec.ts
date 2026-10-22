import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

it('declares the independent remote services used by the main panel', async () => {
  const source = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
  const injections = [...source.matchAll(/ctx\.inject\(\[([^\]]*)\]/gsu)].map(match => match[1] ?? '')
  expect(injections.some(services => services.includes("'remote.skills'"))).toBe(false)
  expect(injections.some(services => services.includes("'remote.session'"))).toBe(true)
})
