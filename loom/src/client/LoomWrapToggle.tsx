/** Auto-wrap switch shared by every surface that shows a comparison. */
import type { ReactNode } from 'react'
import { IconNowrapFillRegular, IconWrapFillRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { COLORS } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** Inputs for the wrap switch. */
export interface LoomWrapToggleProps {
  readonly t: Translate
  /** Current state of comparison line wrapping. */
  readonly wrap: boolean
  readonly onToggle: () => void
}

const control = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, padding: 0, border: 'none', borderRadius: 5, background: 'transparent', cursor: 'pointer' } as const

/**
 * Offer automatic line wrapping so a comparison wider than its panel stays readable without sideways scrolling.
 * @param props - wrap state, its change handler, and the translator.
 * @returns the icon switch, labelled with the action it performs.
 */
export function LoomWrapToggle({ t, wrap, onToggle }: LoomWrapToggleProps): ReactNode {
  return <Tooltip label={t(wrap ? 'diff.unwrap' : 'diff.wrap')} side="bottom" delayMs={400}>
    <button type="button" aria-pressed={wrap} aria-label={t('diff.wrapAria')}
      data-loom-wrap={wrap ? 'on' : 'off'} onClick={onToggle} style={{ ...control, color: wrap ? COLORS.text : COLORS.faint }}>
      {wrap ? <IconNowrapFillRegular size={13} /> : <IconWrapFillRegular size={13} />}
    </button>
  </Tooltip>
}
