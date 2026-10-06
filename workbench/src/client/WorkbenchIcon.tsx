/**
 * Decorative occupant for the Workbench sidebar entry. A 2×2 grid glyph drawn
 * inline for P0; swap for a ui-primitives icon once the panel ships.
 */

import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * Render the grid glyph at the size the sidebar asks for; the sidebar owns the
 * accessible navigation label.
 * @param props - the sidebar's icon share: the requested edge and selection state.
 * @returns decorative grid icon.
 */
export function WorkbenchIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" />
      <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor" />
      <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor" />
      <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
    </svg>
  )
}
