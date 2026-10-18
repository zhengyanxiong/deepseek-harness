import { createRequire } from 'node:module'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin } from '../vitest.shared.ts'

const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url))

export default defineConfig({
  resolve: { alias: [
    { find: 'react-dom/server', replacement: webRequire.resolve('react-dom/server') },
    { find: 'react/jsx-runtime', replacement: webRequire.resolve('react/jsx-runtime') },
    { find: 'react/jsx-dev-runtime', replacement: webRequire.resolve('react/jsx-dev-runtime') },
    { find: /^react$/, replacement: webRequire.resolve('react') },
  ] },
  plugins: [standardDecoratorPlugin(), tsconfigPaths({ projects: ['./tsconfig.base.json'] })],
  test: { include: ['loom/tests/**/*.spec.ts'], environment: 'node' },
})
