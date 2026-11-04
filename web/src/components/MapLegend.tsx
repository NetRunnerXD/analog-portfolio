import { useId, useState, type ReactNode } from 'react'

import type { HeatMode } from '../map/heat'

const KEY = 'ap.legend'

/** Expanded on first load at every width (Project 1, Oct 12: overrides the earlier "collapsed below 1440 px" rule);
 *  after that the user's choice persists for the session. Map fit padding follows the legend's live height. */
function initialOpen(): boolean {
  try {
    if (sessionStorage.getItem(KEY) === 'closed') return false
  } catch { /* storage blocked: fall through */ }
  return true
}

/**
 * Map legend (spec v0.3.1 §8.3). Collapsible on Explore: expanded on first load (Project 1),
 * and the user's choice persists for the session. Collapsed it shows a 64 × 8 ramp chip ("0–100") and a "Legend" toggle
 * (aria-expanded, aria-controls). Story mode passes collapsible={false} so it always stays expanded. It is marked
 * data-map-obscures so map fit/fly-to padding keeps pins out from under it (measured live, so collapsing frees the space).
 */
export default function MapLegend({ title, filterText, insufficientText, collapsible = true, mode = 'absolute', onMode, children }: {
  title: string; filterText: string; insufficientText?: string; collapsible?: boolean
  /** heat colouring: 'view' = percentile among the land in view, 'absolute' = the 0–100 score; the label follows it */
  mode?: HeatMode; onMode?: (m: HeatMode) => void; children?: ReactNode
}) {
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
          {!expanded && <span className="ramp-chip-wrap" aria-hidden="true"><span className="ramp-chip" /><span className="micro num muted2">{mode === 'view' ? 'rank in view' : '0–100'}</span></span>}
          <span className="t-label">Legend</span>
          <span className={`chev ${expanded ? 'up' : ''}`} aria-hidden="true" />
        </button>
      )}
      <div id={id} className="legend-body" hidden={!expanded}>
        <p className="t-label" id="map-legend">{mode === 'view' ? `${title}, compared with the land in view` : `${title} (score)`}</p>
        {onMode && (
          <div className="segmented legend-mode" role="radiogroup" aria-label="Colour by">
            {([['view', 'In this view'], ['absolute', 'Absolute']] as const).map(([m, label]) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => onMode(m)}>{label}</button>
            ))}
          </div>
        )}
        <div className="legend-bar" aria-hidden="true" />
        {mode === 'view' ? (
          <>
            <div className="legend-ticks micro num" aria-hidden="true">{[0, 50, 100].map((v) => <span key={v} style={{ left: `${v}%` }}>{v === 0 ? 'lowest' : v === 50 ? 'median' : 'highest'}</span>)}</div>
            <p className="t-micro muted2 legend-note">Colours rank the land on screen, so they change as you pan or zoom. Scores don't.</p>
            <p className="sr-only">Colour scale by rank among the land in view: dark blue is the least alike on screen, yellow the most alike.</p>
          </>
        ) : (
          <>
            <div className="legend-ticks micro num" aria-hidden="true">{[0, 40, 60, 80, 100].map((v) => <span key={v} style={{ left: `${v}%` }}>{v}</span>)}</div>
            <p className="sr-only">Colour scale from 0 (weak, dark blue) to 100 (strong, yellow). Weak below 40, partial 40 to 59, good 60 to 79, strong 80 and above.</p>
          </>
        )}
        <ul className="legend-items t-small">
          <li><i className="sw sw-nodata" aria-hidden="true" /> No data</li>
          <li><i className="sw sw-filter" aria-hidden="true" /> Filtered out ({filterText})</li>
          {insufficientText && <li><i className="sw sw-insuf" aria-hidden="true" /> {insufficientText}</li>}
        </ul>
        {children}
      </div>
    </div>
  )
}
