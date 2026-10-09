import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { cx } from './format.ts'
import css from '../WorkbenchPanel.module.css'

/** Rows shown per list card before the pager appears. */
export const PAGE_SIZE = 5
export const PAGE_SIZE_LARGE = 10

/** Page window over a list, kept clamped when the list shrinks. */
export interface Pagination<T> {
  current: number
  totalPages: number
  pageItems: readonly T[]
  setPage: (page: number) => void
}

/** Component-private page cursor: a fixed-size slice of a list, no subscription. */
export function usePagination<T>(items: readonly T[], pageSize: number): Pagination<T> {
  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(page, totalPages - 1)
  const start = current * pageSize
  return { current, totalPages, pageItems: items.slice(start, start + pageSize), setPage }
}

/** The pager footer: two chevron buttons flanking a tabular page indicator. */
export function Pager({ current, totalPages, prevLabel, nextLabel, onPrev, onNext }: {
  current: number
  totalPages: number
  prevLabel: string
  nextLabel: string
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <footer className={css.pager}>
      <Button variant="ghost" size="sm" aria-label={prevLabel} disabled={current === 0} onClick={onPrev}
        icon={<IconChevronLeftOutlineRegular size={14} />} />
      <span className={css.pagerLabel}>{current + 1} / {totalPages}</span>
      <Button variant="ghost" size="sm" aria-label={nextLabel} disabled={current >= totalPages - 1} onClick={onNext}
        icon={<IconChevronRightOutlineRegular size={14} />} />
    </footer>
  )
}

/** Build the pager footer for a page, or nothing when the list fits one page. */
export function pagerFooter<T>(page: Pagination<T>, prevLabel: string, nextLabel: string): ReactNode {
  if (page.totalPages <= 1) return undefined
  return (
    <Pager current={page.current} totalPages={page.totalPages} prevLabel={prevLabel} nextLabel={nextLabel}
      onPrev={() => page.setPage(page.current - 1)} onNext={() => page.setPage(page.current + 1)} />
  )
}

/** A card's shell: the settings-card material with a title, optional count, header extra, body, and optional pager. */
export function Card({ wide, icon, title, count, headerExtra, footer, children }: {
  wide?: boolean
  icon: ReactNode
  title: string
  /** Tabular count in the header; omitted when undefined (e.g. trend card shows window chips instead). */
  count?: number
  /** Trailing header content rendered beside the count (e.g. window chips). */
  headerExtra?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={cx(css.card, wide && css.cardWide)}>
      <header className={css.cardHeader}>
        <div className={css.cardTitleGroup}>
          {icon}
          <h2 className={css.cardTitle}>{title}</h2>
        </div>
        {headerExtra}
        {count !== undefined && <span className={css.cardCount}>{count}</span>}
      </header>
      <div className={css.cardBody}>{children}</div>
      {footer}
    </section>
  )
}
