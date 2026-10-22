import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin } from './vitest.shared.ts'

const require = createRequire(import.meta.url)

export default defineConfig({
  resolve: { alias: [
    { find: 'react-dom/server', replacement: require.resolve('react-dom/server') },
    { find: 'react-dom/client', replacement: require.resolve('react-dom/client') },
    { find: 'react/jsx-runtime', replacement: require.resolve('react/jsx-runtime') },
    { find: 'react/jsx-dev-runtime', replacement: require.resolve('react/jsx-dev-runtime') },
    { find: /^react$/, replacement: require.resolve('react') },
  ] },
  plugins: [standardDecoratorPlugin()],
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    // Published client packages ship CSS Modules and read Harness runtime
    // modules from the Web shell's frozen table; transform them through Vite
    // rather than letting Node resolve them as external ESM.
    server: { deps: { inline: [/@deepseek-ai\//] } },
  },
})
