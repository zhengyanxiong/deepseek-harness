/** Generate Loom Host and Client Typert artifacts from the repository source. */
import { resolve } from 'node:path'
import { WorkspaceTypertGenerator } from '../../packages/typert/generator/src/workspace.ts'
import { writeWorkspaceArtifacts } from '../../packages/typert/generator/src/artifact-files.ts'

const root = resolve(import.meta.dirname, '../..')
const generator = new WorkspaceTypertGenerator(root, {
  hostConfig: 'loom/tsconfig.typert.host.json',
  clientConfig: 'loom/tsconfig.typert.client.json',
  packageRoots: ['loom'],
  checkDiagnostics: false,
})
const artifacts = generator.generate(['dsh-loom'])
writeWorkspaceArtifacts(root, artifacts)
for (const artifact of artifacts) {
  console.log(`${artifact.package} ${artifact.face}${artifact.remote === undefined ? '' : ' + remote'}`)
}
