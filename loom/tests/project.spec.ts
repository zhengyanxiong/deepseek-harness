import { expect, it } from 'vitest'
import { parseProject } from '../src/domain/project.ts'

const input = () => ({ name: 'Shop', sources: [{ id: 'web', repo: '/repos/web', path: 'frontend' }], modules: [{ id: 'admin', sourceId: 'web', path: 'apps/admin' }] })
it('imports a project without executing any repository operation', () => {
  expect(parseProject(input())).toEqual(input())
})
it.each(['../outside', '/absolute', 'C:/absolute', 'a/../../b', 'a\\b', '', '.git', 'a//b'])('rejects unsafe repository path %s', path => {
  const value = input(); value.sources[0]!.path = path
  expect(() => parseProject(value)).toThrow('invalid_path')
})
it('rejects overlapping repository directories', () => {
  const value = input(); value.sources.push({ id: 'nested', repo: '/repos/nested', path: 'frontend/nested' })
  expect(() => parseProject(value)).toThrow('overlapping_paths')
})
it('rejects duplicate source identifiers', () => {
  const value = input(); value.sources.push({ id: 'web', repo: '/repos/other', path: 'other' })
  expect(() => parseProject(value)).toThrow('duplicate_id')
})
it('rejects unknown module repositories', () => {
  const value = input(); value.modules[0]!.sourceId = 'missing'
  expect(() => parseProject(value)).toThrow('unknown_source')
})
it('accepts a single repository at the workspace root', () => {
  const value = input(); value.sources[0]!.path = '.'
  expect(parseProject(value).sources[0]?.path).toBe('.')
})
it('rejects a root repository combined with another directory', () => {
  const value = input(); value.sources[0]!.path = '.'; value.sources.push({ id: 'nested', repo: '/repos/nested', path: 'nested' })
  expect(() => parseProject(value)).toThrow('overlapping_paths')
})
it('accepts a module at the repository root', () => {
  const value = input(); value.modules[0]!.path = '.'
  expect(parseProject(value).modules[0]?.path).toBe('.')
})
it.each([null, [], {}, { ...input(), scripts: ['danger'] }, { ...input(), name: '' }])('rejects malformed or unsupported import fields', value => {
  expect(() => parseProject(value)).toThrow()
})
it('returns detached configuration data', () => {
  const value = input(); const parsed = parseProject(value)
  value.sources[0]!.path = 'changed'
  expect(parsed.sources[0]?.path).toBe('frontend')
})
it('admits an optional project Agent preset', () => {
  expect(parseProject({ ...input(), agentPreset: 'planner' }).agentPreset).toBe('planner')
  expect(parseProject(input()).agentPreset).toBeUndefined()
  expect(() => parseProject({ ...input(), agentPreset: '   ' })).toThrow('invalid_string')
})
