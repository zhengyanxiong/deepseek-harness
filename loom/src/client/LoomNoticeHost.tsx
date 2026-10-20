/** Ant-style operation notices, mounted outside the Workloom panel so they survive view changes. */
import { useSyncExternalStore, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { IconCheckCircleFillRegular, IconCloseCircleFillRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { getLoomNotices, subscribeLoomNotices } from './feedback.ts'

const stack: CSSProperties = {
  position: 'fixed', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 1200,
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  width: 'max-content', maxWidth: 'min(460px, calc(100vw - 32px))', pointerEvents: 'none',
}
const card: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 180, maxWidth: 460,
  padding: '9px 13px', borderRadius: 8,
  background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
  border: '0.5px solid var(--dsw-alias-border-l1)', boxShadow: '0 6px 18px rgba(15, 17, 21, .10)',
  fontSize: 13, lineHeight: 1.55, animation: 'loom-notice-in 160ms ease-out',
}
const titleStyle: CSSProperties = { minWidth: 0, overflowWrap: 'anywhere' }
const detailStyle: CSSProperties = { display: 'block', marginTop: 2, color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: 1.5 }
const motion = '@keyframes loom-notice-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}@media (max-width:560px){.loom-notice-stack{top:92px !important}}'

/** Render the latest operation outcomes at the top centre of the window. */
export function LoomNoticeHost() {
  const notices = useSyncExternalStore(subscribeLoomNotices, getLoomNotices, getLoomNotices)
  if (notices.length === 0) return null
  return createPortal(<>
    <style>{motion}</style>
    <div className="loom-notice-stack" style={stack} aria-live="polite" aria-atomic="false">
      {notices.map(notice => <div key={notice.id} role={notice.tone === 'error' ? 'alert' : 'status'} style={card}>
        <span aria-hidden style={{ display: 'flex', flex: 'none', marginTop: 1, color: notice.tone === 'error' ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-success-primary)' }}>
          {notice.tone === 'error' ? <IconCloseCircleFillRegular size={16} /> : <IconCheckCircleFillRegular size={16} />}
        </span>
        <span style={titleStyle}>{notice.title}{notice.detail !== undefined && <span style={detailStyle}>{notice.detail}</span>}</span>
      </div>)}
    </div>
  </>, document.body)
}
