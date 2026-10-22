/**
 * Regenerate the Typert artifacts that publish the Host FaceModel to the Client.
 * The generator analyzes a Harness workspace, so this runs only inside a
 * DeepSeek Harness source checkout; outside it the checked-in artifacts in
 * `lib/` stay authoritative.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const generatorSource = resolve(import.meta.dirname, '../../packages/typert/generator/src/workspace.ts')
if (!existsSync(generatorSource)) {
  console.error(
    'generate-typert: run this from a DeepSeek Harness source checkout (loom/ inside the monorepo).\n'
      + 'The published @deepseek-ai/dsh-typert-generator cannot analyze a standalone package yet, '
      + 'so the checked-in lib/typert.* artifacts remain authoritative here.',
  )
  process.exit(1)
}

const { WorkspaceTypertGenerator } = await import(generatorSource)
const { writeWorkspaceArtifacts } = await import(resolve(import.meta.dirname, '../../packages/typert/generator/src/artifact-files.ts'))
const root = resolve(import.meta.dirname, '../..')
const generator = new WorkspaceTypertGenerator(root, {
  hostConfig: 'loom/tsconfig.typert.host.json',
  clientConfig: 'loom/tsconfig.typert.client.json',
  packageRoots: ['loom'],
  checkDiagnostics: false,
})
const artifacts = generator.generate(['dsh-workloom'])
writeWorkspaceArtifacts(root, artifacts)
for (const artifact of artifacts) {
  console.log(`${artifact.package} ${artifact.face}${artifact.remote === undefined ? '' : ' + remote'}`)
}
