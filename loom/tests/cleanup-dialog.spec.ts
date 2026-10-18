import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { WorkspaceRecord } from 'dsh-workloom/types'
import { LoomCleanupDialog } from '../src/client/LoomCleanupDialog.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'
const t = (key: LoomKey) => en[key]
const workspace: WorkspaceRecord = { id: brandString<WorkspaceRecord['id']>('w1'), versionId: brandString<'loom.version'>('v1'), lockId: brandString<'loom.lock'>('l1'), path: '/tmp/loom/workspace' }
const props = { t, workspace, busy: false, loadChanges: () => Promise.reject(new Error('unused')), renderFactorySlot: () => null, onConfirm: () => {}, onDiscard: () => {}, onCancel: () => {} }
it('renders cleanup confirmation as a dialog with a real Diff entry point', () => {
  const html = renderToStaticMarkup(createElement(LoomCleanupDialog, { ...props, failure: undefined, discardAllowed: false }))
  expect(html).toContain('role="dialog"')
  expect(html).toContain(en['workspace.cleanupWarning'])
  expect(html).toContain(en['workspace.cleanupViewChanges'])
  expect(html).toContain(en['workspace.cleanupMaximize'])
  expect(html).toContain(en['workspace.cleanupConfirm'])
  expect(html).toContain(workspace.path)
})
it('makes the destructive discard option explicit after a blocked cleanup', () => {
  const html = renderToStaticMarkup(createElement(LoomCleanupDialog, { ...props, failure: 'workspace_changes', discardAllowed: true }))
  expect(html).toContain(en['workspace.cleanupDiscardHint'])
  expect(html).toContain(en['workspace.cleanupDiscard'])
  expect(html).not.toContain(en['workspace.cleanupConfirm'])
})
