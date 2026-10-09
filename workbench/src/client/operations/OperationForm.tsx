/** Retained operation form; submitting prepares a request, never reports business completion. */
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchKey } from '../locales.ts'
import { reminderInstant, validateOperation } from './operations.ts'
import type { OperationDraft, OperationKind } from './operations.ts'
import css from '../WorkbenchPanel.module.css'

const TITLE: Record<OperationKind, WorkbenchKey> = {
  'new-session': 'cmd.newSession', 'run-workflow': 'cmd.runWorkflow', 'new-job': 'cmd.newJob',
  'add-todo': 'cmd.addTodo', 'set-reminder': 'cmd.setReminder',
}
const PREFIX: Record<OperationKind, WorkbenchKey | undefined> = {
  'new-session': undefined, 'run-workflow': 'cmd.prompt.workflow', 'new-job': 'cmd.prompt.newJob',
  'add-todo': 'cmd.prompt.todo', 'set-reminder': 'cmd.prompt.reminder',
}

/** Render the selected operation with parent-owned draft persistence. */
export function OperationForm({ kind, draft, target, t, onChange, onPrepare, onClose }: {
  kind: OperationKind
  draft: OperationDraft
  target: string
  t(key: WorkbenchKey): string
  onChange(draft: OperationDraft): void
  onPrepare(prompt: string): Promise<boolean>
  onClose(): void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<WorkbenchKey | null>(null)
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const update = (patch: Partial<OperationDraft>): void => { onChange({ ...draft, ...patch }); setError(null) }
  const instant = reminderInstant(draft)
  const timing = instant === undefined ? '' : t('op.timePrompt').replace('{instant}', instant.toISOString()).replace('{zone}', zone)
  return <form className={css.operationForm} onSubmit={event => {
    event.preventDefault()
    if (busy) return
    const issue = validateOperation(kind, draft, Date.now())
    if (issue !== undefined) { setError(issue === 'content' ? 'op.invalidContent' : 'op.invalidTime'); return }
    const prefix = PREFIX[kind]
    const prompt = [prefix === undefined ? '' : t(prefix), draft.content.trim(),
      ...(kind === 'set-reminder' ? [timing, t('op.repeatPrompt').replace('{repeat}', t(draft.repeat === 'daily' ? 'op.daily' : 'op.once'))] : []),
    ].filter(Boolean).join('\n')
    setBusy(true)
    void onPrepare(prompt).then(ok => { if (!ok) setError('op.failed') }, () => { setError('op.failed') }).finally(() => { setBusy(false) })
  }}>
    <h2>{t(TITLE[kind])}</h2>
    <p>{t('op.target')}: {target}</p>
    <p className={css.operationHint}>{t('op.explain')}</p>
    <fieldset disabled={busy} className={css.operationFields}>
      <label>{t('op.content')}<textarea required value={draft.content} onChange={e => { update({ content: e.target.value }) }} /></label>
      {kind === 'set-reminder' && <>
        <label>{t('op.date')}<input type="date" required value={draft.date} onChange={e => { update({ date: e.target.value }) }} /></label>
        <label>{t('op.time')}<input type="time" required value={draft.time} onChange={e => { update({ time: e.target.value }) }} /></label>
        <label>{t('op.repeat')}<select value={draft.repeat} onChange={e => { update({ repeat: e.target.value === 'daily' ? 'daily' : 'once' }) }}><option value="once">{t('op.once')}</option><option value="daily">{t('op.daily')}</option></select></label>
        <p className={css.operationHint}>{timing || zone}</p>
      </>}
    </fieldset>
    {error !== null && <p role="alert">{t(error)}</p>}
    <div className={css.deckActions}><Button type="submit" disabled={busy}>{t(busy ? 'op.pending' : 'op.prepare')}</Button><Button type="button" disabled={busy} onClick={onClose}>{t('op.close')}</Button></div>
  </form>
}
