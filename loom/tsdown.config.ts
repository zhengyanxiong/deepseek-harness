/** Independent Host/Client build for the Workloom bundle. */
import { readFile } from 'node:fs/promises'
import { dirname, resolve as resolvePath } from 'node:path'
import { transform } from 'lightningcss'
import { defineConfig } from 'tsdown'
import { standardDecoratorPlugin } from '../vitest.shared.ts'

/** Runtime modules supplied by the Web shell's frozen module table. */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis', 'zod',
  '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
]
const isExternal = (specifier: string): boolean =>
  PLATFORM_MODULES.some(module => specifier === module || specifier.startsWith(`${module}/`))

const CSS_VIRTUAL_PREFIX = '\0dsh-workloom-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** Keep CSS inert at import time; the Client owner controls its mounted lifetime. */
function styleModule(css: string, classMap: Readonly<Record<string, string>>): string {
  return [
    `const cssText = ${JSON.stringify(css)};`,
    `const classNames = ${JSON.stringify(classMap)};`,
    'export { cssText };',
    'export default classNames;',
  ].join('\n')
}

/** Compile plugin-owned CSS Modules without appending global style tags. */
const cssModulesPlugin = {
  name: 'dsh-workloom-css-modules',
  resolveId(source: string, importer: string | undefined) {
    if (!source.endsWith('.module.css')) return null
    const absolute = importer === undefined ? source : resolvePath(dirname(importer), source)
    return CSS_VIRTUAL_PREFIX + absolute + CSS_VIRTUAL_SUFFIX
  },
  async load(this: { addWatchFile(id: string): void }, virtualId: string) {
    if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
    const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
    this.addWatchFile(fileId)
    const source = await readFile(fileId)
    const result = transform({ filename: fileId, code: source, cssModules: { pattern: '[hash]_[local]' }, minify: true })
    const classMap: Record<string, string> = {}
    for (const [local, exported] of Object.entries(result.exports ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      classMap[local] = exported.name
    }
    return styleModule(result.code.toString(), classMap)
  },
}

export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    plugins: [standardDecoratorPlugin()],
    deps: { neverBundle: (specifier: string) => specifier.startsWith('@deepseek-ai/') || specifier === 'zod' },
    outputOptions: { entryFileNames: '[name].js' },
  },
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    target: 'es2022',
    dts: false,
    clean: false,
    deps: {
      neverBundle: isExternal,
      alwaysBundle: (specifier: string) => !isExternal(specifier),
    },
    plugins: [cssModulesPlugin],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: () => 'window.__ModuleLoader__.load({ id: "dsh-workloom", factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
