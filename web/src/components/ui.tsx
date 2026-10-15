import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

const BASE = import.meta.env.BASE_URL

/** Brand sprite icon (spec §8.1). Decorative: the visible label next to it carries the meaning. */
export function Icon({ name, size = 24, className }: { name: string; size?: 20 | 24; className?: string }) {
  return (
    <svg className={`icon ${className ?? ''}`} width={size} height={size} aria-hidden="true" focusable="false">
      <use href={`${BASE}icons/icons.svg#${size === 20 ? `${name}-20` : name}`} />
    </svg>
  )
}

/** Final lockup, 153×32 (spec §2.3); Mars variant only when the active content is about Mars. */
export function Logo({ body, onHome }: { body?: 'moon' | 'mars'; onHome: () => void }) {
  const file = body === 'mars' ? 'analog-portfolio-mars-lockup-dark.svg' : 'analog-portfolio-lockup-dark.svg'
  return (
    <a className="brand" href={BASE} aria-label="Analog Portfolio home" onClick={(e) => { e.preventDefault(); onHome() }}>
      <img src={`${BASE}brand/${file}`} width={153} height={32} alt="Analog Portfolio" />
    </a>
  )
}

export function InfoIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8 7v4.2M8 4.6v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
}
export function ErrorIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="err-icon"><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="M8 4.2v4.6M8 11.2v.2" stroke="var(--color-bg-canvas)" strokeWidth="1.8" strokeLinecap="round" /></svg>
}
export function ShieldIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 1.5 13 3.5v4c0 3.2-2.2 5.6-5 7-2.8-1.4-5-3.8-5-7v-4z" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="m5.6 8 1.7 1.7L10.6 6.4" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
}
/** ⤒ arrow-to-bar: "covered at Earth's limit" */
export function AtLimitIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 2.5h10M8 14V5.5M4.5 9 8 5.5 11.5 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
export function GapIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M4 9.5 9.5 4M5.5 12 12 5.5M8.5 13 13 8.5" stroke="currentColor" strokeWidth="1.2" /></svg>
}
export function FlaskIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 1.5h4M6.5 1.5v4.2L2.6 12.6A1.3 1.3 0 0 0 3.7 14.5h8.6a1.3 1.3 0 0 0 1.1-1.9L9.5 5.7V1.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
}

/** role="radiogroup" with arrow keys and roving tabindex (spec §8.1 SegmentedControl). Disabled options stay focusable. */
export function SegmentedControl<V extends string>({ label, options, value, onChange }: {
  label: string
  options: { value: V; label: ReactNode; disabled?: boolean; reason?: string | null }[]
  value: V
  onChange: (v: V) => void
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const rid = useId()
  const idx = Math.max(0, options.findIndex((o) => o.value === value))
  const move = (d: number) => {
    let i = idx
    for (let k = 0; k < options.length; k++) { i = (i + d + options.length) % options.length; if (!options[i].disabled) break }
    refs.current[i]?.focus()
    if (!options[i].disabled) onChange(options[i].value)
  }
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button key={o.value} ref={(r) => { refs.current[i] = r }} type="button" role="radio" aria-checked={o.value === value}
          aria-disabled={o.disabled || undefined} aria-describedby={o.disabled && o.reason ? `${rid}-${i}` : undefined}
          tabIndex={i === idx ? 0 : -1} className={o.value === value ? 'on' : ''}
          title={o.disabled && o.reason ? o.reason : undefined}
          onClick={() => !o.disabled && onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1) }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
          }}>
          {o.label}
          {o.disabled && o.reason && <span id={`${rid}-${i}`} className="sr-only">{o.reason}</span>}
        </button>
      ))}
    </div>
  )
}

export function Banner({ tone, title, children, action }: { tone: 'info' | 'warning' | 'error'; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`banner banner-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="banner-icon">{tone === 'error' ? <ErrorIcon /> : <InfoIcon />}</span>
      <div><strong className="banner-title">{title}</strong> {children}{action && <div className="banner-action">{action}</div>}</div>
    </div>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <InfoIcon />
      <p className="t-title">{title}</p>
      <p className="t-body muted2">{body}</p>
      {action}
    </div>
  )
}

export function ErrorState({ title, body, detail, onRetry, retryLabel = 'Try again' }: { title: string; body: string; detail?: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="error-state" role="alert">
      <span className="err"><ErrorIcon size={32} /></span>
      <p className="t-title">{title}</p>
      <p className="t-body">{body}</p>
      {onRetry && <button type="button" className="btn btn-primary" onClick={onRetry}>{retryLabel}</button>}
      {detail && <details><summary>Details</summary><code className="micro">{detail}</code></details>}
    </div>
  )
}

/** Non-modal info popover (spec §8.4 InfoPopover): ⓘ trigger, Esc closes and returns focus. */
export function InfoPopover({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <span className="info-pop">
      <button ref={btn} type="button" className="info-btn" aria-label={`About ${title}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <InfoIcon />
      </button>
      {open && (
        <span id={id} role="dialog" aria-label={title} className="popover">
          <strong className="t-title">{title}</strong>
          <span className="t-small">{children}</span>
        </span>
      )}
    </span>
  )
}

export function Toast({ message, tone = 'neutral', onDone }: { message: string; tone?: 'neutral' | 'error'; onDone: () => void }) {
  useEffect(() => { if (tone === 'neutral') { const t = setTimeout(onDone, 4000); return () => clearTimeout(t) } }, [tone, onDone])
  return (
    <div className={`toast toast-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {tone === 'error' && <ErrorIcon />} {message}
      {tone === 'error' && <button type="button" className="btn btn-ghost" onClick={onDone}>Dismiss</button>}
    </div>
  )
}
