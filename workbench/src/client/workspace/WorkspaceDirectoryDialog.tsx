/**
 * In-app directory browser for the workbench's new-workspace flow. Shown when
 * the host serves the browse directory-picker capability (no native OS
 * chooser): the operator walks one level at a time, creates a folder if
 * needed, and adopts the listed directory as a Workspace.
 */

import { useEffect, useState } from 'react'
import { Button, IconFolderCloseRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DirectoryListing } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkbenchKey } from '../locales.ts'
import css from './WorkspaceDirectoryDialog.module.css'

/** Owner seat: the panel holds the browsing state and the Host actions. */
export interface WorkspaceDirectoryDialogProps {
  /** Panel locale seat. */
  t: (key: WorkbenchKey) => string
  /** Whether the dialog is showing. */
  open: boolean
  /** Current listing; null while the first level loads. */
  listing: DirectoryListing | null
  /** A Host call is in flight; every affordance disables. */
  busy: boolean
  /** Open one child directory. */
  onEnter: (path: string) => Promise<void>
  /** Create one child directory under the current level, then enter it. */
  onNewFolder: (name: string) => Promise<void>
  /** Adopt the current level as a Workspace. */
  onAdopt: () => Promise<void>
  /** Dismiss the dialog. */
  onClose: () => void
}

/**
 * Render the browse dialog: breadcrumb, directory rows, new-folder row, and
 * the adopt/cancel footer.
 * @param props - owner seat (see interface).
 * @returns the modal tree (null while closed).
 */
export function WorkspaceDirectoryDialog({
  t, open, listing, busy, onEnter, onNewFolder, onAdopt, onClose,
}: WorkspaceDirectoryDialogProps) {
  const [showHidden, setShowHidden] = useState(false)
  const [folderOpen, setFolderOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  useEffect(() => {
    if (!open) {
      setFolderOpen(false)
      setFolderName('')
    }
  }, [open])
  const entries = listing === null ? [] : listing.entries.filter(entry => showHidden || !entry.hidden)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('dlg.browseTitle')}
      closeLabel={t('dlg.close')}
      className={css.dialog ?? ''}
      footer={(
        <div className={css.footer}>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>{t('dlg.cancel')}</Button>
          <Button variant="primary" size="sm" disabled={busy || listing === null} onClick={() => { void onAdopt() }}>
            {t('dlg.openHere')}
          </Button>
        </div>
      )}
    >
      {listing === null
        ? <p className={css.status}>{t('dlg.loading')}</p>
        : (
            <div className={css.body}>
              <nav className={css.crumbs} aria-label={t('dlg.browseTitle')}>
                {listing.crumbs.map((crumb, index) => (
                  <span key={crumb.path} className={css.crumbItem}>
                    {index > 0 && <span className={css.crumbSep}>/</span>}
                    <button
                      type="button"
                      className={css.crumb}
                      disabled={busy || index === listing.crumbs.length - 1}
                      onClick={() => { void onEnter(crumb.path) }}
                    >
                      {crumb.path === listing.home ? t('dlg.home') : crumb.name}
                    </button>
                  </span>
                ))}
              </nav>
              <div className={css.toolbar}>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setFolderOpen(v => !v) }}>
                  {t('dlg.newFolder')}
                </Button>
                <label className={css.showHidden}>
                  <input
                    type="checkbox"
                    checked={showHidden}
                    disabled={busy}
                    onChange={event => { setShowHidden(event.target.checked) }}
                  />
                  {t('dlg.showHidden')}
                </label>
              </div>
              {folderOpen && (
                <div className={css.newFolderRow}>
                  <input
                    className={css.newFolderInput}
                    value={folderName}
                    placeholder={t('dlg.folderName')}
                    disabled={busy}
                    data-modal-autofocus
                    onChange={event => { setFolderName(event.target.value) }}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && folderName.trim() !== '') {
                        void onNewFolder(folderName).then(() => {
                          setFolderOpen(false)
                          setFolderName('')
                        })
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || folderName.trim() === ''}
                    onClick={() => {
                      void onNewFolder(folderName).then(() => {
                        setFolderOpen(false)
                        setFolderName('')
                      })
                    }}
                  >
                    {t('dlg.create')}
                  </Button>
                </div>
              )}
              <div className={css.list} role="list">
                {entries.length === 0 && <p className={css.status}>{t('dlg.empty')}</p>}
                {entries.map(entry => (
                  <button
                    key={entry.path}
                    type="button"
                    role="listitem"
                    className={css.row}
                    disabled={busy}
                    onClick={() => { void onEnter(entry.path) }}
                  >
                    <IconFolderCloseRegular size={16} />
                    <span className={css.rowName}>{entry.name}</span>
                  </button>
                ))}
              </div>
              {listing.truncated && <p className={css.status}>{t('dlg.truncated')}</p>}
            </div>
          )}
    </Modal>
  )
}
