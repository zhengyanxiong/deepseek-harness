/** Reusable native file comparison; the caller owns fetching and supplies computed hunks. */
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChangesDiffState } from './changes-diff.ts'
import type { NS } from './locales.ts'
import { FileDiff } from './FileDiff.tsx'

/** Caller-computed comparison and its view controls. */
export interface FileDiffFactoryInput {
  /** Ready hunks, or the empty, binary, oversized, loading, or error state. */
  state: ChangesDiffState
  split: boolean
  wrap: boolean
  retry: () => void
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotFactoryMap {
    /** Native comparison over caller-supplied hunks, for surfaces outside the review tab. */
    'deliverables.fileDiff': {
      scope: 'root'
      props: FileDiffFactoryInput
      locale: typeof NS
    }
  }
}

/**
 * Draw the native comparison with the deliverables dictionary.
 * @param props - caller comparison, view controls, and bound copy.
 * @returns the same component the review tab renders.
 */
export function FileDiffFactory({ state, split, wrap, retry, t }: FileDiffFactoryInput & PropsLocale<typeof NS>): ReactNode {
  return <FileDiff state={state} split={split} wrap={wrap} retry={retry} t={t} />
}
