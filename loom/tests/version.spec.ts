import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SourceConfig } from '../src/domain/project.ts'
const sourceId = (value: string) => brandString<SourceConfig['id']>(value)
import { parseProject } from '../src/domain/project.ts'
import { resolveLock } from '../src/domain/version.ts'

const project = parseProject({ name: 'Shop', sources: [{ id: 'web', repo: '/web', path: 'web' }, { id: 'api', repo: '/api', path: 'api' }], modules: [] })
it('resolves every version repository regardless of selected task modules', async () => {
  const calls: string[] = []
  const result = await resolveLock(project, { id: 'v1', sources: [{ sourceId: sourceId('web'), ref: 'main' }, { sourceId: sourceId('api'), ref: 'release' }] }, 'lock1', async (repo, ref) => {
    calls.push(`${repo}:${ref}`)
    return 'a'.repeat(40)
  })
  expect(calls).toEqual(['/web:main', '/api:release'])
  expect(result.repositories).toHaveLength(2)
})
it('rejects missing sources before resolving anything', async () => {
  let called = false
  await expect(resolveLock(project, { id: 'v1', sources: [{ sourceId: sourceId('missing'), ref: 'main' }] }, 'l', async () => { called = true; return 'a'.repeat(40) })).rejects.toThrow('unknown_source')
  expect(called).toBe(false)
})
it('does not return a partial lock when a repository fails', async () => {
  await expect(resolveLock(project, { id: 'v1', sources: [{ sourceId: sourceId('web'), ref: 'main' }, { sourceId: sourceId('api'), ref: 'main' }] }, 'l', async repo => {
    if (repo === '/api') throw new Error('unavailable')
    return 'a'.repeat(40)
  })).rejects.toThrow('unavailable')
})
it.each(['main', '', 'abc', 'g'.repeat(40)])('rejects a non-commit resolution %s', async commit => {
  await expect(resolveLock(project, { id: 'v1', sources: [{ sourceId: sourceId('web'), ref: 'main' }] }, 'l', async () => commit)).rejects.toThrow('invalid_commit')
})
it('rejects an empty version before resolving repositories', async () => {
  await expect(resolveLock(project, { id: 'v1', sources: [] }, 'l', async () => 'a'.repeat(40))).rejects.toThrow('empty_version')
})
it('supports Git SHA-256 object identifiers', async () => {
  const lock = await resolveLock(project, { id: 'v1', sources: [{ sourceId: sourceId('web'), ref: 'main' }] }, 'l', async () => 'a'.repeat(64))
  expect(lock.repositories[0]?.commit).toHaveLength(64)
})
it('captures repository configuration before asynchronous resolution', async () => {
  const mutable = { name: 'Shop', sources: [{ id: sourceId('web'), repo: '/web', path: 'web' }, { id: sourceId('api'), repo: '/api', path: 'api' }], modules: [] }
  const version = { id: 'v1', sources: [{ sourceId: sourceId('web'), ref: 'main' }, { sourceId: sourceId('api'), ref: 'main' }] }
  const calls: string[] = []
  const lock = await resolveLock(mutable, version, 'l', async repo => {
    calls.push(repo)
    version.id = 'changed'
    mutable.sources[1]!.repo = '/changed'
    mutable.sources[1]!.id = sourceId('changed')
    return 'a'.repeat(40)
  })
  expect(calls).toEqual(['/web', '/api'])
  expect(lock.versionId).toBe('v1')
  expect(lock.repositories.map(row => row.sourceId)).toEqual(['web', 'api'])
})
it('rejects duplicate repository selections before resolution', async () => {
  await expect(resolveLock(project, { id: 'v1', sources: [{ sourceId: sourceId('web'), ref: 'main' }, { sourceId: sourceId('web'), ref: 'other' }] }, 'l', async () => 'a'.repeat(40))).rejects.toThrow('duplicate_source')
})
