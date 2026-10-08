import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./tsconfig.base.json'] })],
  test: {
    include: ['workbench/tests/operation-form.spec.tsx', 'workbench/tests/operation-panel.spec.tsx'],
    environment: 'jsdom',
  },
})
