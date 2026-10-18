/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { ProjectForm } from '../src/client/LoomForms.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'

const t = (key: LoomKey) => en[key]
let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

it('advances from the name step with only a name before repositories are filled', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(ProjectForm, {
      t, open: true, create: async () => ({ ok: false, error: { code: 'invalid_form', message: 'unused' } }), onCreated: () => undefined,
    }))
  })
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Project name"]')
  expect(input).not.toBeNull()
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, '安抚')
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const next = [...container.querySelectorAll('button')].find(button => button.textContent === en['form.next'])
  expect(next).toBeDefined()
  await act(async () => { next?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
  expect(container.textContent).toContain(en['source.hint'])
  expect(container.textContent).not.toContain('invalid_form')
  expect(container.querySelector('input[aria-label="Project name"]')).toBeNull()
})
