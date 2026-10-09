/**
 * 命令面板 (design §5): an Input plus a keyboard-navigable listbox with fuzzy
 * matching, locale groups, a most-recently-used group, and a second-level
 * dynamic candidate list for parameterized commands.
 */

import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { scoreCommand } from './commands.ts'
import type { CommandOption, WorkbenchCommand } from './commands.ts'
import type { WorkbenchKey } from '../locales.ts'
import css from '../WorkbenchPanel.module.css'

/** A palette row: either a command or one of its parameter candidates. */
type PaletteItem =
  | { readonly type: 'command'; readonly command: WorkbenchCommand }
  | { readonly type: 'param'; readonly command: WorkbenchCommand; readonly option: CommandOption }

/** Props for the command palette surface. */
export interface CommandPaletteProps {
  commands: readonly WorkbenchCommand[]
  mruIds: readonly string[]
  t(key: WorkbenchKey): string
  onRun(command: WorkbenchCommand, target?: CommandOption): void
  onClose(): void
}

/**
 * Render the palette: filter input, MRU group, matched command groups, and the
 * parameterized command's second-level candidates.
 * @param props - commands, MRU order, locale, and run/close callbacks.
 * @returns the palette surface.
 */
export function CommandPalette({ commands, mruIds, t, onRun, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [pendingParam, setPendingParam] = useState<WorkbenchCommand | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const items = useMemo<PaletteItem[]>(() => {
    if (pendingParam !== null && pendingParam.param !== undefined) {
      return pendingParam.param.options().map(option => ({ type: 'param', command: pendingParam, option }))
    }
    if (query.trim().length === 0) {
      // Empty query: MRU order first, then every other command in registry order.
      const mruCommands = mruIds
        .map(id => commands.find(candidate => candidate.id === id))
        .filter((command): command is WorkbenchCommand => command !== undefined)
      const rest = commands.filter(command => !mruIds.includes(command.id))
      return [...mruCommands, ...rest].map(command => ({ type: 'command', command }))
    }
    return commands
      .map(command => ({ command, score: scoreCommand(t(command.nameKey), command.keywords, query) }))
      .filter(entry => entry.score >= 0)
      .sort((left, right) => right.score - left.score)
      .map(entry => ({ type: 'command', command: entry.command }))
  }, [commands, mruIds, pendingParam, query, t])

  const mruLength = query.trim().length === 0 && pendingParam === null
    ? mruIds.filter(id => commands.some(command => command.id === id)).length
    : 0

  const clampedActive = items.length === 0 ? -1 : Math.min(activeIndex, items.length - 1)

  const execute = (item: PaletteItem): void => {
    if (item.type === 'param') {
      onRun(item.command, item.option)
      return
    }
    if (item.command.param !== undefined) {
      setPendingParam(item.command)
      setQuery('')
      setActiveIndex(0)
      inputRef.current?.focus()
      return
    }
    onRun(item.command)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (items.length === 0) return
      setActiveIndex(() => (clampedActive + 1) % items.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (items.length === 0) return
      setActiveIndex(() => (clampedActive - 1 + items.length) % items.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = items[clampedActive]
      if (item !== undefined) execute(item)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      if (pendingParam !== null) {
        setPendingParam(null)
        setActiveIndex(0)
      } else {
        onClose()
      }
    }
  }

  // Group headers: the MRU prefix gets one "最近使用" header, then each command group in registry order.
  const rendered: ReactNode[] = []
  let lastGroup: string | null = null
  items.forEach((item, index) => {
    if (item.type === 'command') {
      const header = index < mruLength ? t('palette.mru') : t(item.command.groupKey)
      if (header !== lastGroup) {
        rendered.push(<div key={`group-${header}-${index}`} className={css.paletteGroup}>{header}</div>)
        lastGroup = header
      }
    } else if (index === 0) {
      rendered.push(<div key="group-param" className={css.paletteGroup}>{t(pendingParam?.param?.labelKey ?? 'palette.pickTarget')}</div>)
      lastGroup = null
    }
    const Icon = item.command.icon
    rendered.push(
      <button
        key={item.type === 'command' ? item.command.id : `param-${item.option.id}`}
        type="button"
        role="option"
        aria-selected={index === clampedActive}
        className={index === clampedActive ? `${css.paletteItem} ${css.paletteItemActive}` : css.paletteItem}
        onMouseEnter={() => { setActiveIndex(index) }}
        onClick={() => { execute(item) }}
      >
        <Icon size={15} />
        <span className={css.paletteItemLabel}>{item.type === 'command' ? t(item.command.nameKey) : item.option.label}</span>
        {item.type === 'command' && item.command.param !== undefined && (
          <span className={css.paletteItemHint}>{t('palette.pickTarget')}</span>
        )}
      </button>,
    )
  })

  return (
    <section className={css.palette} aria-label={t('top.palette')}>
      <Input
        ref={inputRef}
        value={query}
        onChange={event => { setQuery(event.target.value); setActiveIndex(0) }}
        onKeyDown={onKeyDown}
        placeholder={t('palette.placeholder')}
        autoFocus
      />
      <div className={css.paletteList} role="listbox">
        {rendered.length === 0
          ? <p className={css.empty}>{pendingParam !== null ? t('palette.noTargets') : t('palette.noMatch')}</p>
          : rendered}
      </div>
    </section>
  )
}
