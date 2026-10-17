import { defineConfig } from 'tsdown'
import { clientBundle } from '../tsdown.client.ts'

/** Standalone source bundle; DSH workspace builds and watchers skip this private plugin. */
export default defineConfig((config) => {
  if (config.watch || config.env?.DSH_BUILD_FACE === 'host' || config.env?.DSH_BUILD_FACE === 'client') {
    return { entry: '' }
  }
  // Only lib/client.js and its map are deployed to jev-guard-plugin.
  return clientBundle(import.meta.dirname, ['src/client/locales.ts'])(config)
})
