/** In-app directory browser for Hosts whose directory picker exposes browse primitives. */
import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Button, IconChevronLeftOutlineRegular, IconFolderOpenRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { DirectoryListing } from 'dsh-workloom/types'
import { COLORS } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

const input: CSSProperties = {
  flex: 1, minWidth: 120, height: 32, boxSizing: 'border-box', padding: '0 9px', border: `0.5px solid ${COLORS.borderStrong}`,
  borderRadius: 'var(--dsw-radius-sm)', background: COLORS.panel, color: COLORS.text, font: 'inherit', fontSize: 12.5,
}
const list: CSSProperties = {
  display: 'flex', flexDirection: 'column', minHeight: 220, maxHeight: 360, overflowY: 'auto',
  border: `0.5px solid ${COLORS.border}`, borderRadius: 'var(--dsw-radius-md)', background: COLORS.panel2,
}
const row: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', border: 0,
  borderBottom: `0.5px solid ${COLORS.border}`, borderRadius: 0, background: 'transparent', color: COLORS.text,
  font: 'inherit', fontSize: 12.5, textAlign: 'left', cursor: 'pointer',
}
const pathLine: CSSProperties = { margin: 0, color: COLORS.dim, fontSize: 11.5, overflowWrap: 'anywhere', fontFamily: 'ui-monospace, monospace' }
const alert: CSSProperties = { margin: 0, color: COLORS.error, fontSize: 12, lineHeight: 1.6 }
const note: CSSProperties = { margin: 0, padding: '16px 10px', color: COLORS.dim, fontSize: 12, textAlign: 'center' }

/** Inputs for the in-app directory browser. */
export interface LoomDirectoryBrowserProps {
  readonly t: Translate
  readonly startPath?: string
  readonly loadListing: (path: string | undefined, signal: AbortSignal) => Promise<RemoteResult<DirectoryListing>>
  readonly onCancel: () => void
  readonly onPick: (path: string) => void
}

/**
 * Browse Host directories one level at a time and return the chosen absolute path.
 * @param props - locale, initial path, listing Remote and the pick/cancel outcomes.
 * @returns the directory browser modal.
 */
export function LoomDirectoryBrowser({ t, startPath, loadListing, onCancel, onPick }: LoomDirectoryBrowserProps) {
  const [listing, setListing] = useState<DirectoryListing>()
  const [pathInput, setPathInput] = useState(startPath ?? '')
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string>()
  const [showHidden, setShowHidden] = useState(false)

  const load = useCallback(async (path: string | undefined, signal?: AbortSignal) => {
    setLoading(true)
    setFailure(undefined)
    try {
      const result = await loadListing(path, signal ?? new AbortController().signal)
      if (signal?.aborted === true) return
      if (result.ok) {
        setListing(result.value)
        setPathInput(result.value.path)
      } else setFailure(`${result.error.code}: ${result.error.message}`)
    } catch (error) {
      if (signal?.aborted !== true) setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      if (signal?.aborted !== true) setLoading(false)
    }
  }, [loadListing])

  useEffect(() => {
    const controller = new AbortController()
    void load(startPath, controller.signal)
    return () => { controller.abort() }
  }, [load, startPath])

  const parent = listing?.crumbs.at(-2)
  const visible = (listing?.entries ?? []).filter(entry => showHidden || !entry.hidden)
  const hiddenCount = (listing?.entries ?? []).filter(entry => entry.hidden).length
  const openPath = (): void => { void load(pathInput.trim() === '' ? undefined : pathInput.trim()) }

  return <Modal
    open
    title={t('directory.title')}
    closeLabel={t('form.close')}
    onClose={onCancel}
    footer={<>
      <Button variant="ghost" onClick={onCancel}>{t('form.cancel')}</Button>
      <Button variant="primary" disabled={listing === undefined || loading} onClick={() => { if (listing !== undefined) onPick(listing.path) }}>{t('directory.select')}</Button>
    </>}
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Button size="sm" variant="ghost" icon={<IconChevronLeftOutlineRegular />} disabled={parent === undefined || loading} onClick={() => { if (parent !== undefined) void load(parent.path) }}>{t('directory.up')}</Button>
        <Button size="sm" variant="ghost" disabled={loading} onClick={() => { void load(undefined) }}>{t('directory.home')}</Button>
        <input aria-label={t('directory.path')} value={pathInput} placeholder={t('directory.pathPlaceholder')}
          onChange={event => setPathInput(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); openPath() } }} style={input} />
        <Button size="sm" variant="outline" disabled={loading} onClick={openPath}>{t('directory.open')}</Button>
      </div>
      {listing !== undefined && <p style={pathLine}>{t('directory.current')}: {listing.path}</p>}
      <p style={{ ...pathLine, fontFamily: 'inherit' }}>{t('directory.pathHint')}</p>
      <div style={list} role="list">
        {loading && <p style={note}>{t('directory.loading')}</p>}
        {!loading && visible.map(entry => <button key={entry.path} type="button" role="listitem" style={row}
          onClick={() => { void load(entry.path) }}>
          <span aria-hidden style={{ display: 'inline-flex', color: COLORS.dim }}><IconFolderOpenRegular size={14} /></span>
          <span style={{ overflowWrap: 'anywhere' }}>{entry.name}</span>
        </button>)}
        {!loading && visible.length === 0 && listing !== undefined && <p style={note}>{t('directory.empty')}</p>}
      </div>
      {listing?.truncated === true && <p style={pathLine}>{t('directory.truncated')}</p>}
      {hiddenCount > 0 && <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: COLORS.dim, fontSize: 12 }}>
        <input type="checkbox" checked={showHidden} onChange={event => setShowHidden(event.target.checked)} />{t('directory.showHidden')}
      </label>}
      {failure !== undefined && <div role="alert">
        <p style={alert}>{t('directory.failed')}</p>
        <code style={{ ...pathLine, color: COLORS.error }}>{failure}</code>
      </div>}
    </div>
  </Modal>
}
