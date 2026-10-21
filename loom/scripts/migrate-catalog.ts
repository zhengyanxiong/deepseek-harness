/** One-shot Loom catalog migration: schema v1 to v2, with an on-disk backup. */
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createJsonStore } from '../src/storage/json-store.ts'
import { migrateCatalog, parseCatalog, type CatalogSnapshot } from '../src/host/catalog.ts'

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

async function main(): Promise<void> {
  const file = argument('--file')
  if (file === undefined || file.trim() === '') {
    throw new Error('usage: migrate-catalog --file <catalog.json> [--output <catalog.json>]')
  }
  const source = resolve(file)
  const envelope = JSON.parse(await readFile(source, 'utf8')) as { schema?: unknown; version?: unknown; data?: unknown }
  if (envelope.schema !== 'loom-json-store' || typeof envelope.version !== 'number') throw new Error('not a Loom catalog')
  if (envelope.version >= 2) {
    process.stdout.write(`catalog already at version ${envelope.version}; nothing to do\n`)
    return
  }
  const stamp = new Date().toISOString().replaceAll(/[:.]/gu, '-')
  const backup = `${source}.v${envelope.version}-${stamp}.bak`
  await copyFile(source, backup)
  const output = argument('--output')
  const target = output === undefined ? source : resolve(output)
  const raw = structuredClone(envelope.data)
  const migrated = migrateCatalog(raw)
  const parsed = parseCatalog(migrated) as CatalogSnapshot
  const store = createJsonStore<CatalogSnapshot>({ file: target, version: 2, parse: parseCatalog, migrate: migrateCatalog })
  await store.write(parsed)
  process.stdout.write(JSON.stringify({
    source,
    output: target,
    backup,
    projects: parsed.projects.length,
    versions: parsed.versions.length,
    tasks: parsed.tasks.length,
    workspaces: parsed.workspaces.length,
  }, null, 2) + '\n')
}

await main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
