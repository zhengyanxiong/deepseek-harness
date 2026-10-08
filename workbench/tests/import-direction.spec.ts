import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const client = path.resolve('workbench/src/client')
const features = new Set(['command', 'monitor', 'operations', 'conversation', 'workspace', 'activity', 'shared'])

function violations(file: string, source: string): string[] {
  const owner = path.relative(client, file).split(path.sep)[0]
  const errors: string[] = []
  for (const match of source.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)) {
    const target = path.resolve(path.dirname(file), match[1])
    const relative = path.relative(client, target)
    const targetOwner = relative.split(path.sep)[0]
    if (relative === 'WorkbenchPanel.tsx' || (features.has(targetOwner) && targetOwner !== owner && targetOwner !== 'shared' && targetOwner !== 'activity')) {
      errors.push(`${file}: ${match[1]}`)
    }
  }
  return errors
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name)
    return entry.isDirectory() ? sources(file) : /\.tsx?$/.test(file) ? [file] : []
  })
}

test('feature modules do not import the page or sibling features', () => {
  const fixture = path.join(client, 'command', 'Example.tsx')
  assert.deepEqual(violations(fixture, "import { Card } from '../WorkbenchPanel.tsx'"), [`${fixture}: ../WorkbenchPanel.tsx`])
  assert.deepEqual(violations(fixture, "import { things } from '../monitor/MonitorTab.tsx'"), [`${fixture}: ../monitor/MonitorTab.tsx`])
  const actual = sources(client).filter(file => features.has(path.relative(client, file).split(path.sep)[0]))
  assert.ok(actual.length > 0, 'the feature-directory test must inspect real source files')
  assert.deepEqual(actual.flatMap(file => violations(file, readFileSync(file, 'utf8'))), [])
})
