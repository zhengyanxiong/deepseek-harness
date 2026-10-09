// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OperationForm } from '../src/client/operations/OperationForm.tsx'
import type { OperationDraft } from '../src/client/operations/operations.ts'
import { zh } from '../src/client/locales.ts'

const t = (key: keyof typeof zh): string => zh[key]
const emptyDraft = (): OperationDraft => ({ content: '', date: '', time: '', repeat: 'once' })

function renderForm(overrides: Partial<{
  kind: 'new-session' | 'run-workflow' | 'add-todo' | 'set-reminder'
  draft: OperationDraft
  onChange: (draft: OperationDraft) => void
  onPrepare: (prompt: string) => Promise<boolean>
  onClose: () => void
}> = {}) {
  const props = {
    kind: 'new-session' as const,
    draft: emptyDraft(),
    target: '会话 A',
    t,
    onChange: vi.fn(),
    onPrepare: vi.fn(async () => true),
    onClose: vi.fn(),
    ...overrides,
  }
  return { ...render(<OperationForm {...props} />), props }
}

afterEach(cleanup)

describe('OperationForm', () => {
  it('retains field edits through parent-owned onChange', () => {
    const { props } = renderForm({ kind: 'set-reminder' })
    const content = screen.getByLabelText(zh['op.content'])
    const date = screen.getByLabelText(zh['op.date'])
    const time = screen.getByLabelText(zh['op.time'])

    fireEvent.change(content, { target: { value: '  发布提醒  ' } })
    fireEvent.change(date, { target: { value: '2099-12-31' } })
    fireEvent.change(time, { target: { value: '09:30' } })

    expect(props.onChange).toHaveBeenNthCalledWith(1, { ...emptyDraft(), content: '  发布提醒  ' })
    expect(props.onChange).toHaveBeenNthCalledWith(2, { ...emptyDraft(), date: '2099-12-31' })
    expect(props.onChange).toHaveBeenNthCalledWith(3, { ...emptyDraft(), time: '09:30' })
  })

  it('shows localized validation errors and does not prepare invalid drafts', () => {
    const { props } = renderForm({ kind: 'set-reminder' })
    fireEvent.submit(screen.getByRole('button', { name: zh['op.prepare'] }).closest('form')!)
    expect(screen.getByRole('alert').textContent).toBe(zh['op.invalidContent'])
    expect(props.onPrepare).not.toHaveBeenCalled()

    cleanup()
    const second = renderForm({ kind: 'set-reminder', draft: { ...emptyDraft(), content: '提醒' } })
    fireEvent.submit(screen.getByRole('button', { name: zh['op.prepare'] }).closest('form')!)
    expect(screen.getByRole('alert').textContent).toBe(zh['op.invalidTime'])
    expect(second.props.onPrepare).not.toHaveBeenCalled()
  })

  it.each([
    ['false', async () => false],
    ['throw', async () => { throw new Error('prepare failed') }],
  ])('keeps content and reports failure when onPrepare %s', async (_case, onPrepare) => {
    const draft = { ...emptyDraft(), content: '保留这段内容' }
    const { props } = renderForm({ draft, onPrepare })
    fireEvent.submit(screen.getByRole('button', { name: zh['op.prepare'] }).closest('form')!)

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(zh['op.failed']))
    expect(props.onChange).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue(draft.content)).not.toBeNull()
  })

  it('ignores repeated submits while busy and re-enables after settlement', async () => {
    let resolve!: (value: boolean) => void
    const pending = new Promise<boolean>(res => { resolve = res })
    const onPrepare = vi.fn(() => pending)
    const { props } = renderForm({ draft: { ...emptyDraft(), content: '只准备一次' }, onPrepare })
    const form = screen.getByRole('button', { name: zh['op.prepare'] }).closest('form')!

    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(onPrepare).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button', { name: zh['op.pending'] }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByDisplayValue('只准备一次').closest('fieldset')?.disabled).toBe(true)

    resolve(true)
    await waitFor(() => expect((screen.getByRole('button', { name: zh['op.prepare'] }) as HTMLButtonElement).disabled).toBe(false))
    expect(props.onChange).not.toHaveBeenCalled()
  })

  it('prepares a prompt draft without claiming business completion', async () => {
    const onPrepare = vi.fn(async () => true)
    const draft = { ...emptyDraft(), content: '  写周报  ' }
    renderForm({ kind: 'add-todo', draft, onPrepare })
    fireEvent.submit(screen.getByRole('button', { name: zh['op.prepare'] }).closest('form')!)

    await waitFor(() => expect(onPrepare).toHaveBeenCalledTimes(1))
    expect(onPrepare).toHaveBeenCalledWith(`${zh['cmd.prompt.todo']}\n写周报`)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(zh['op.explain'])).not.toBeNull()
  })
})
