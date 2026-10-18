import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createJsonStore, JsonStoreError } from '../src/storage/json-store.ts'

const roots: string[] = []
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'loom-store-'))
  roots.push(root)
  return { root, file: join(root, 'state.json') }
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!root.startsWith(join(tmpdir(), 'loom-store-'))) throw new Error('unexpected cleanup path')
    await rm(root, { recursive: true, force: true })
  }
})
function parse(value: unknown): { count: number } {
  if (typeof value !== 'object' || value === null || !('count' in value) || typeof value.count !== 'number') throw new Error('bad count')
  return { count: value.count }
}
it('round trips a versioned envelope and loads a detached snapshot', async () => {
  const { file } = await fixture()
  const store = createJsonStore({ file, version: 1, parse })
  expect(store.snapshot()).toBeUndefined()
  await store.write({ count: 4 })
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ schema: 'loom-json-store', version: 1, data: { count: 4 } })
  const fresh = createJsonStore({ file, version: 1, parse })
  const loaded = await fresh.load()
  loaded.count = 99
  expect(fresh.snapshot()).toEqual({ count: 4 })
})
it('serializes concurrent writes in invocation order', async () => {
  const { file } = await fixture()
  const store = createJsonStore({ file, version: 1, parse })
  await Promise.all(Array.from({ length: 20 }, (_, count) => store.write({ count })))
  expect(store.snapshot()).toEqual({ count: 19 })
  expect(await createJsonStore({ file, version: 1, parse }).load()).toEqual({ count: 19 })
})
it.each(['{', '{}', '{"schema":"other","version":1,"data":{"count":1}}', '{"schema":"loom-json-store","version":2,"data":{"count":1}}', '{"schema":"loom-json-store","version":1,"data":{"count":"bad"}}'])('refuses corrupt data without publishing it: %s', async text => {
  const { file } = await fixture()
  const store = createJsonStore({ file, version: 1, parse })
  await store.write({ count: 3 })
  await writeFile(file, text)
  await expect(store.load()).rejects.toMatchObject({ code: 'corrupt' })
  expect(store.snapshot()).toEqual({ count: 3 })
  expect(await readFile(file, 'utf8')).toBe(text)
})
it('reports a missing file distinctly instead of inventing empty data', async () => {
  const { file } = await fixture()
  const store = createJsonStore({ file, version: 1, parse })
  await expect(store.load()).rejects.toMatchObject({ code: 'missing' })
  expect(store.snapshot()).toBeUndefined()
})
it('does not publish a failed write and accepts later writes', async () => {
  const { file } = await fixture()
  let fail = false
  const store = createJsonStore({ file, version: 1, parse, stringify: (value: unknown) => {
    if (fail) throw new Error('serialization failed')
    return JSON.stringify(value)
  } })
  await store.write({ count: 1 })
  fail = true
  await expect(store.write({ count: 2 })).rejects.toBeInstanceOf(JsonStoreError)
  expect(store.snapshot()).toEqual({ count: 1 })
  expect(JSON.parse(await readFile(file, 'utf8')).data).toEqual({ count: 1 })
  fail = false
  await store.write({ count: 3 })
  expect(store.snapshot()).toEqual({ count: 3 })
})
it('reports filesystem write failures without publishing a snapshot', async () => {
  const { file } = await fixture()
  await mkdir(file)
  const store = createJsonStore({ file, version: 1, parse })
  await expect(store.write({ count: 1 })).rejects.toMatchObject({ code: 'write_failed' })
  expect(store.snapshot()).toBeUndefined()
})
it('captures input before an asynchronous write can mutate it', async () => {
  const { file } = await fixture()
  const store = createJsonStore({ file, version: 1, parse })
  const value = { count: 1 }
  const pending = store.write(value)
  value.count = 20
  await pending
  expect(store.snapshot()).toEqual({ count: 1 })
})
