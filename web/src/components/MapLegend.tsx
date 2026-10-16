import { useId, useState, type ReactNode } from 'react'

const KEY = 'ap.legend'
const PHONE = '(max-width: 599px)'

/** Expanded unless the user collapsed it this session; phones start collapsed (spec v0.3.1 §8.3). */
function initialOpen(): boolean {
  try {
    const v = sessionStorage.getItem(KEY)
    if (v === 'open') return true
    if (v === 'closed') return false
  } catch { /* storage blocked: fall through */ }
  return !(typeof matchMedia === 'function' && matchMedia(PHONE).matches)
}

/**
 * Map legend (spec v0.3.1 §8.3). Collapsible on Explore: expanded by default on desktop and tablet, collapsed on phones,
 * and the user's choice persists for the session. Collapsed it shows a 64 × 8 ramp chip ("0–100") and a "Legend" toggle
 * (aria-expanded, aria-controls). Story mode passes collapsible={false} so it always stays expanded. It is marked
 * data-map-obscures so map fit/fly-to padding keeps pins out from under it (measured live, so collapsing frees the space).
 */
export default function MapLegend({ title, filterText, collapsible = true, children }: { title: string; filterText: string; collapsible?: boolean; children?: ReactNode }) {
  const [open, setOpen] = useState(initialOpen)
  const id = useId()
  const expanded = !collapsible || open
  const toggle = () => setOpen((o) => {
    try { sessionStorage.setItem(KEY, o ? 'closed' : 'open') } catch { /* ignore */ }
    return !o
  })
  return (
    <div className={`map-legend ${expanded ? '' : 'collapsed'}`} data-map-obscures="bottom">
      {collapsible && (
        <button type="button" className="legend-toggle" aria-expanded={expanded} aria-controls={id} onClick={toggle}>
          {!expanded && <span className="ramp-chip-wrap" aria-hidden="true"><span className="ramp-chip" /><span className="micro num muted2">0–100</span></span>}
          <span className="t-label">Legend</span>
          <span className={`chev ${expanded ? 'up' : ''}`} aria-hidden="true" />
        </button>
      )}
      <div id={id} className="legend-body" hidden={!expanded}>
        <p className="t-label" id="map-legend">{title}</p>
        <div className="legend-bar" aria-hidden="true" />
        <div className="legend-ticks micro num" aria-hidden="true">{[0, 40, 60, 80, 100].map((v) => <span key={v} style={{ left: `${v}%` }}>{v}</span>)}</div>
        <p className="sr-only">Colour scale from 0 (weak, dark blue) to 100 (strong, yellow). Weak below 40, partial 40 to 59, good 60 to 79, strong 80 and above.</p>
        <ul className="legend-items t-small">
          <li><i className="sw sw-nodata" aria-hidden="true" /> No data</li>
          <li><i className="sw sw-filter" aria-hidden="true" /> Filtered out ({filterText})</li>
        </ul>
        {children}
      </div>
    </div>
  )
}
