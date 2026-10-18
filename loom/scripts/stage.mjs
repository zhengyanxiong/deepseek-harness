/**
 * Stage the built Loom bundle for an existing source-checkout DSH installation.
 * Usage: node scripts/stage.mjs <installation-root> [target-dir]
 * The staged package links the installation's own workspace packages so its
 * Host imports load the same module instances the running installation uses.
 */
import { cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

const [rootArgument, targetArgument] = process.argv.slice(2)
if (rootArgument === undefined) {
  console.error('usage: node scripts/stage.mjs <installation-root> [target-dir]')
  process.exit(1)
}
if (!isAbsolute(rootArgument)) throw new Error('installation root must be absolute')
const installation = resolve(rootArgument)
const manifest = JSON.parse(await readFile(join(installation, 'package.json'), 'utf8'))
const links = {
  '@deepseek-ai/cordis': join(installation, 'vendor', 'cordis'),
  '@deepseek-ai/schemastery': join(installation, 'vendor', 'schemastery'),
  '@deepseek-ai/dsh-brand': join(installation, 'packages', 'util', 'brand'),
  '@deepseek-ai/dsh-typert-protocol': join(installation, 'packages', 'typert', 'protocol'),
  zod: join(installation, 'packages', 'typert', 'protocol', 'node_modules', 'zod'),
}
for (const [name, path] of Object.entries(links)) {
  try { await readFile(join(path, 'package.json')) } catch {
    console.error(`missing ${name} at ${path}; pass a source-checkout installation root`)
    process.exit(1)
  }
}
const target = resolve(targetArgument ?? join(import.meta.dirname, '..', 'dist-local'))
await rm(target, { recursive: true, force: true })
await mkdir(join(target, 'src'), { recursive: true })
await cp(join(import.meta.dirname, '..', 'lib'), join(target, 'lib'), { recursive: true })
await cp(join(import.meta.dirname, '..', 'locale'), join(target, 'locale'), { recursive: true })
await cp(join(import.meta.dirname, '..', 'icon.svg'), join(target, 'icon.svg'))
await cp(join(import.meta.dirname, '..', 'cordis.patch.yml'), join(target, 'cordis.patch.yml'))
await cp(join(import.meta.dirname, '..', 'src', 'types.ts'), join(target, 'src', 'types.ts'))
for (const [name, path] of Object.entries(links)) {
  const destination = join(target, 'node_modules', ...name.split('/'))
  await mkdir(join(destination, '..'), { recursive: true })
  await symlink(path, destination, 'dir')
}
const source = JSON.parse(await readFile(join(import.meta.dirname, '..', 'package.json'), 'utf8'))
// Resolution comes from the staged node_modules links, so peers are empty here.
source.peerDependencies = {}
source.version = `${source.version}+local.${manifest.version ?? 'dsh'}`
await writeFile(join(target, 'package.json'), `${JSON.stringify(source, undefined, 2)}\n`)
console.log(target)
