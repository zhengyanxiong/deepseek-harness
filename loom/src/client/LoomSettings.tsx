/** Loom-local preferences; no Host business state is stored here. */
import type { CSSProperties } from 'react'
import type { ProjectRecord } from 'dsh-workloom/types'
import { IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { COLORS, metaLine } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** Browser-persisted workbench defaults. */
export interface LoomPreferences {
  readonly view: 'workbench' | 'kanban'
  readonly kanbanMode: 'flat' | 'grouped'
  readonly contextOpen: boolean
  /** Context-aside width in pixels. */
  readonly asideWidth: number
  /** File- and turn-preview aside width in pixels. */
  readonly previewWidth: number
  /** Expanded bottom-pane body height in pixels. */
  readonly bottomHeight: number
  /** Maximum Session rows shown in each sidebar group. */
  readonly sessionLimit: number
}

/** Defaults used when storage is empty or malformed. */
export const DEFAULT_PREFERENCES: LoomPreferences = { view: 'workbench', kanbanMode: 'grouped', contextOpen: true, asideWidth: 272, previewWidth: 560, bottomHeight: 170, sessionLimit: 5 }
const STORAGE_KEY = 'loom.preferences'

/**
 * Read preferences from localStorage without letting malformed values break the workbench.
 * @returns admitted preferences or the defaults.
 */
export function readPreferences(): LoomPreferences {
  if (typeof localStorage === 'undefined') return DEFAULT_PREFERENCES
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return DEFAULT_PREFERENCES
    const record = value as Record<string, unknown>
    const view = record.view === 'kanban' ? 'kanban' : 'workbench'
    const kanbanMode = record.kanbanMode === 'flat' ? 'flat' : 'grouped'
    const contextOpen = record.contextOpen !== false
    const size = (key: 'asideWidth' | 'previewWidth' | 'bottomHeight' | 'sessionLimit', fallback: number, min: number, max: number): number => {
      const raw = record[key]
      return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(Math.max(Math.round(raw), min), max) : fallback
    }
    return {
      view, kanbanMode, contextOpen,
      asideWidth: size('asideWidth', DEFAULT_PREFERENCES.asideWidth, 220, 720),
      previewWidth: size('previewWidth', DEFAULT_PREFERENCES.previewWidth, 300, 960),
      bottomHeight: size('bottomHeight', DEFAULT_PREFERENCES.bottomHeight, 80, 900),
      sessionLimit: size('sessionLimit', DEFAULT_PREFERENCES.sessionLimit, 1, 20),
    }
  } catch { return DEFAULT_PREFERENCES }
}

/** Persist preferences; a blocked storage write leaves the current session working. */
export function writePreferences(preferences: LoomPreferences): void {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)) } catch { /* preferences stay session-local */ }
}

const backdrop: CSSProperties = { position: 'absolute', inset: 0, background: 'rgba(0,0,0,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }
const panel: CSSProperties = { width: 400, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 80px)', overflow: 'auto', background: COLORS.panel, border: `0.5px solid ${COLORS.border}`, borderRadius: 'var(--dsw-radius-lg)', padding: 16, boxShadow: '0 18px 48px rgba(0,0,0,.45)' }
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }
const label: CSSProperties = { color: COLORS.dim, fontSize: 11.5 }
const sectionTitle: CSSProperties = { margin: '0 0 8px', color: COLORS.text, fontSize: 12, fontWeight: 500 }
const group: CSSProperties = { marginBottom: 14, paddingBottom: 14, borderBottom: `0.5px solid ${COLORS.border}` }
const input: CSSProperties = { background: COLORS.panel2, color: COLORS.text, border: `0.5px solid ${COLORS.border}`, borderRadius: 6, padding: '6px 8px', font: 'inherit', fontSize: 12 }
const button: CSSProperties = { color: 'inherit', background: 'transparent', border: `0.5px solid ${COLORS.border}`, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', font: 'inherit', fontSize: 12 }
const sessionLimits = Array.from({ length: 20 }, (_value, index) => index + 1)

/** Inputs for the Loom settings overlay. */
export interface LoomSettingsProps {
  readonly t: Translate
  readonly open: boolean
  readonly preferences: LoomPreferences
  readonly pinned: readonly ProjectRecord[]
  readonly onChange: (preferences: LoomPreferences) => void
  readonly onUnpin: (id: ProjectRecord['id']) => void
  readonly onClose: () => void
}

/**
 * Render workbench defaults and pinned-project management.
 * @param props - current preferences and close/unpin actions.
 * @returns a settings overlay, or null when closed.
 */
export function LoomSettings({ t, open, preferences, pinned, onChange, onUnpin, onClose }: LoomSettingsProps) {
  if (!open) return null
  return <div style={backdrop} onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={t('settings.title')} style={panel} onClick={event => event.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{t('settings.title')}</span>
        <button type="button" aria-label={t('form.close')} title={t('form.close')} style={{ ...button, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, padding: 0 }} onClick={onClose}><IconCloseOutlineRegular size={13} /></button>
      </div>
      <div style={group}>
        <p style={sectionTitle}>{t('settings.sidebar')}</p>
        <label style={field}><span style={label}>{t('settings.sessionLimit')}</span>
          <select aria-label={t('settings.sessionLimit')} value={String(preferences.sessionLimit)} onChange={event => onChange({ ...preferences, sessionLimit: Number(event.target.value) })} style={input}>
            {sessionLimits.map(limit => <option key={limit} value={String(limit)}>{t('side.sessionLimit').replace('{limit}', String(limit))}</option>)}
          </select>
        </label>
        <p style={{ ...metaLine, margin: 0 }}>{t('settings.sessionLimitHint')}</p>
      </div>
      <div style={group}>
        <p style={sectionTitle}>{t('settings.workspace')}</p>
        <label style={field}><span style={label}>{t('settings.defaultView')}</span>
          <select aria-label={t('settings.defaultView')} value={preferences.view} onChange={event => onChange({ ...preferences, view: event.target.value === 'kanban' ? 'kanban' : 'workbench' })} style={input}>
            <option value="workbench">{t('workbench')}</option>
            <option value="kanban">{t('view.kanban')}</option>
          </select>
        </label>
        <label style={field}><span style={label}>{t('settings.kanbanMode')}</span>
          <select aria-label={t('settings.kanbanMode')} value={preferences.kanbanMode} onChange={event => onChange({ ...preferences, kanbanMode: event.target.value === 'flat' ? 'flat' : 'grouped' })} style={input}>
            <option value="grouped">{t('kb.grouped')}</option>
            <option value="flat">{t('kb.flat')}</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <input type="checkbox" checked={preferences.contextOpen} onChange={event => onChange({ ...preferences, contextOpen: event.target.checked })} />
          {t('settings.contextOpen')}
        </label>
      </div>
      <div>
        <p style={sectionTitle}>{t('settings.pinned')}</p>
        {pinned.length === 0 && <p style={{ ...metaLine, margin: '6px 0 0' }}>{t('settings.noPins')}</p>}
        {pinned.map(project => <div key={project.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
          <span style={{ overflowWrap: 'anywhere' }}>{project.config.name}</span>
          <button type="button" style={{ ...button, marginLeft: 'auto', padding: '2px 7px', fontSize: 11 }} onClick={() => onUnpin(project.id)}>{t('settings.unpin')}</button>
        </div>)}
      </div>
      <p style={{ ...metaLine, margin: '12px 0 0' }}>{t('settings.localOnly')}</p>
    </div>
  </div>
}
