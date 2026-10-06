/**
 * Workbench panel plugin, node half. The empty apply keeps the browser-only
 * feature addressable from the host-owned Loader overlay.
 */

/** Plugin name the host Loader records for this row. */
export const name = 'dsh-workbench'

/** Host plugin body — Workbench behavior exists only in the browser entry. */
export function apply(): void {}
