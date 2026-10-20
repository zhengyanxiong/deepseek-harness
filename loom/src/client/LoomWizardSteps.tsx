/** Shared creation-wizard step rail for Workloom modals. */
import type { CSSProperties } from 'react'
import { IconCheckOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { COLORS } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** One step in a Workloom creation wizard. */
export interface LoomWizardStep<Key extends string> {
  readonly key: Key
  readonly label: LoomKey
  /** Step may be skipped without blocking later steps. */
  readonly optional?: boolean
}

/** Inputs for a Workloom creation-wizard step rail. */
export interface LoomWizardStepsProps<Key extends string> {
  readonly t: Translate
  readonly steps: readonly LoomWizardStep<Key>[]
  readonly current: Key
  readonly ariaLabel: LoomKey
  /** Whether a step may be visited with the current field values. */
  readonly canVisit: (key: Key) => boolean
  readonly onSelect: (key: Key) => void
}

const rail: CSSProperties = { display: 'flex', alignItems: 'center', listStyle: 'none', padding: '15px 0 17px', margin: '14px 0 18px', borderBottom: `0.5px solid ${COLORS.border}`, background: 'transparent' }
const item: CSSProperties = { display: 'flex', alignItems: 'center', minWidth: 0 }
const button: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, padding: 0, border: 'none', background: 'transparent', font: 'inherit', color: 'inherit' }
const circle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, boxSizing: 'border-box', borderRadius: 999, border: '1px solid', fontSize: 11, fontWeight: 500, flex: 'none' }

/**
 * Render the completed/current/upcoming step rail used by the project, version and task modals.
 * @param props - localized labels, current step and visit guard.
 * @returns a semantic ordered list of step buttons.
 */
export function LoomWizardSteps<Key extends string>({ t, steps, current, ariaLabel, canVisit, onSelect }: LoomWizardStepsProps<Key>) {
  const currentIndex = steps.findIndex(step => step.key === current)
  return <ol className="loom-wizard-steps" aria-label={t(ariaLabel)} style={rail}>
    {steps.map((step, index) => {
      const active = step.key === current
      const complete = index < currentIndex
      const blocked = !canVisit(step.key)
      return <li key={step.key} style={{ ...item, flex: index === steps.length - 1 ? '0 1 auto' : '1 1 0' }}>
        <button type="button" aria-current={active ? 'step' : undefined} aria-disabled={blocked} disabled={blocked}
          onClick={() => { if (!active && !blocked) onSelect(step.key) }}
          style={{ ...button, cursor: blocked || active ? 'default' : 'pointer', opacity: blocked ? 0.5 : 1 }}>
          <span style={{
            ...circle,
            borderColor: active || complete ? COLORS.accent : COLORS.borderStrong,
            background: active || complete ? COLORS.accent : COLORS.panel,
            color: active || complete ? 'var(--dsw-alias-label-primary-foreground)' : COLORS.dim,
            ...(active ? { boxShadow: '0 0 0 4px color-mix(in srgb, var(--loom-accent) 13%, transparent)' } : {}),
          }}>{complete ? <IconCheckOutlineRegular size={12} /> : String(index + 1)}</span>
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, maxWidth: '100%', minWidth: 0 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: active ? COLORS.text : complete ? COLORS.dim : COLORS.faint, fontSize: 12, fontWeight: active ? 500 : 400 }}>{t(step.label)}</span>
            {step.optional === true && <span style={{ color: COLORS.faint, fontSize: 9.5, flex: 'none' }}>{t('wizard.optional')}</span>}
          </span>
        </button>
        {index < steps.length - 1 && <span aria-hidden style={{ flex: 1, height: 1, minWidth: 20, margin: '0 12px', background: complete ? COLORS.accent : COLORS.border }} />}
      </li>
    })}
  </ol>
}
