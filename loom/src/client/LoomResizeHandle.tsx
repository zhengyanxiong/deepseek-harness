/** Keyboard- and pointer-resizable split between two Loom regions. */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

/** The side of the pane the handle sits on; dragging away from that side grows the pane. */
export type LoomResizeOrientation = 'vertical' | 'horizontal'

/** Inputs for one splitter. */
export interface LoomResizeHandleProps {
  /** Localized separator label. */
  readonly label: string
  /** Vertical handles resize width; horizontal handles resize height. */
  readonly orientation: LoomResizeOrientation
  /** Current pane size in pixels. */
  readonly value: number
  /** Smallest accepted size. */
  readonly min: number
  /** Largest accepted size. */
  readonly max: number
  /** Grow the pane when the pointer moves left (vertical) or up (horizontal). */
  readonly invert: boolean
  /** Receives the clamped next size while dragging or using the keyboard. */
  readonly onChange: (value: number) => void
  /** Optional class for responsive hiding. */
  readonly className?: string
}

/**
 * Clamp one proposed pane size.
 * @param value - proposed size after applying a pointer or key delta.
 * @param min - smallest accepted size.
 * @param max - largest accepted size.
 * @returns the size within the accepted interval.
 */
export function clampSize(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/**
 * Turn a pointer or key delta into a pane size.
 * @param start - size when the interaction began.
 * @param delta - pointer movement to the right or down, or the equivalent key step.
 * @param invert - whether movement away from the pane grows it.
 * @param min - smallest accepted size.
 * @param max - largest accepted size.
 * @returns the clamped next size.
 */
export function nextSize(start: number, delta: number, invert: boolean, min: number, max: number): number {
  return clampSize(start + (invert ? -delta : delta), min, max)
}

const BASE: CSSProperties = { flex: 'none', position: 'relative', zIndex: 6, touchAction: 'none', outline: 'none' }

/**
 * Draw a splitter that changes a size by dragging or arrow keys.
 * @param props - orientation, bounds, and the size callback.
 * @returns the separator element.
 */
export function LoomResizeHandle({ label, orientation, value, min, max, invert, onChange, className }: LoomResizeHandleProps): ReactNode {
  const [dragging, setDragging] = useState(false)
  const [hover, setHover] = useState(false)
  const drag = useRef<{ start: number; value: number } | undefined>(undefined)
  useEffect(() => {
    if (!dragging) return
    const previousSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    const move = (event: PointerEvent): void => {
      const current = drag.current
      if (current === undefined) return
      const delta = orientation === 'vertical' ? event.clientX - current.start : event.clientY - current.start
      onChange(nextSize(current.value, delta, invert, min, max))
    }
    const stop = (): void => { drag.current = undefined; setDragging(false) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      document.body.style.userSelect = previousSelect
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [dragging, orientation, invert, min, max, onChange])
  const vertical = orientation === 'vertical'
  const active = dragging || hover
  return <div
    className={className}
    role="separator"
    aria-label={label}
    aria-orientation={orientation}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={Math.round(value)}
    tabIndex={0}
    title={label}
    style={{ ...BASE, ...(vertical ? { width: 7, cursor: 'col-resize' } : { height: 7, cursor: 'row-resize' }), background: active ? 'rgba(47,129,247,.16)' : 'transparent' }}
    onPointerEnter={() => setHover(true)}
    onPointerLeave={() => setHover(false)}
    onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { start: vertical ? event.clientX : event.clientY, value }
      setDragging(true)
    }}
    onKeyDown={(event) => {
      const step = event.shiftKey ? 40 : 12
      let delta: number | undefined
      if (event.key === 'Home') { event.preventDefault(); onChange(min); return }
      if (event.key === 'End') { event.preventDefault(); onChange(max); return }
      if (vertical && event.key === 'ArrowLeft') delta = -step
      else if (vertical && event.key === 'ArrowRight') delta = step
      else if (!vertical && event.key === 'ArrowUp') delta = -step
      else if (!vertical && event.key === 'ArrowDown') delta = step
      if (delta === undefined) return
      event.preventDefault()
      onChange(nextSize(value, delta, invert, min, max))
    }}
  >
    <span aria-hidden style={{ position: 'absolute', ...(vertical ? { top: 0, bottom: 0, left: 3, width: 1 } : { left: 0, right: 0, top: 3, height: 1 }), background: active ? 'var(--dsw-alias-label-accent, #2f81f7)' : 'var(--dsw-alias-border-l2)' }} />
  </div>
}
