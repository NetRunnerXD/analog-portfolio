import { useEffect, useRef, useState } from 'react'
import { FACTOR_UI } from '../copy'
import { CORE_FACTORS } from '../types/contract'
import { Icon } from './ui'

/** Custom weights (spec §8.5): 10 sliders 0–40 step 5 that must total 100. Modal dialog with focus trap; Esc closes. */
export default function WeightsSheet({ initial, defaults, purposeName, onApply, onClose }: {
  initial: Record<string, number>
  defaults: Record<string, number>
  purposeName: string
  onApply: (w: Record<string, number>) => void
  onClose: () => void
}) {
  const [w, setW] = useState<Record<string, number>>(() => Object.fromEntries(CORE_FACTORS.map((f) => [f, initial[f] ?? 0])))
  const ref = useRef<HTMLDivElement>(null)
  const total = CORE_FACTORS.reduce((a, f) => a + (w[f] ?? 0), 0)
  const ok = total === 100
  const max = Math.max(40, ...Object.values(defaults))

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      if (e.key === 'Tab' && ref.current) {
        const els = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]')]
        const first = els[0]
        const last = els[els.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [onClose])

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-labelledby="ws-title" aria-describedby="ws-desc">
        <h2 id="ws-title" className="t-h2">Adjust what counts</h2>
        <p id="ws-desc" className="t-small muted2">Starting point: {purposeName}. Weights are percentages and must add up to 100. A factor at 0 is not a need.</p>
        <ul className="weights">
          {CORE_FACTORS.map((f) => {
            const ui = FACTOR_UI[f]
            return (
              <li key={f} className="wrow">
                <span className={`ficon g-${ui.group}`} aria-hidden="true"><Icon name={`factor-${ui.group}`} size={20} /></span>
                <label htmlFor={`w-${f}`} className="t-label">{ui.name}</label>
                <input id={`w-${f}`} type="range" min={0} max={max} step={5} value={w[f]} aria-valuetext={`${w[f]} percent`}
                  onChange={(e) => setW((o) => ({ ...o, [f]: Number(e.target.value) }))} />
                <output htmlFor={`w-${f}`} className="num">{w[f]}</output>
              </li>
            )
          })}
        </ul>
        <p className={`total num ${ok ? '' : 'bad'}`} aria-live="polite">Total {total} / 100{ok ? '' : ` · ${total > 100 ? 'remove' : 'add'} ${Math.abs(100 - total)}`}</p>
        <div className="sheet-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setW({ ...defaults })}>Reset to {purposeName}</button>
          <span className="grow" />
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" aria-disabled={!ok || undefined} aria-describedby={!ok ? 'ws-why' : undefined}
            onClick={() => ok && onApply(w)}>Apply</button>
        </div>
        {!ok && <p id="ws-why" className="t-small muted2">Weights must add up to 100 before you can apply them.</p>}
        <p className="t-small muted2">Robustness badges are hidden under custom weights: they were tested with the default weights only.</p>
      </div>
    </div>
  )
}
