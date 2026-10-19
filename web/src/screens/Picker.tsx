import { useMemo, useRef } from 'react'
import { PURPOSE_ICON, PURPOSE_UI, STATUS_BADGE } from '../copy'
import { fmtLat, hasScorableFeatures, purposeName, targetMeta } from '../lib/format'
import type { Profile, ProfilesFile, PurposeId, Target, TargetBody } from '../types/contract'
import { Icon, SegmentedControl } from '../components/ui'

interface Props {
  targets: Target[]
  profiles: ProfilesFile
  targetId: string
  purposeId: string
  onTarget: (id: string) => void
  onPurpose: (id: string) => void
  onGo: () => void
  onCustom: () => void
}

export default function Picker({ targets, profiles, targetId, purposeId, onTarget, onPurpose, onGo, onCustom }: Props) {
  const target = targets.find((t) => t.id === targetId)
  const body: TargetBody = target?.body ?? 'moon'
  const list = targets.filter((t) => t.body === body)
  const listRef = useRef<HTMLUListElement>(null)
  const switchBody = (b: TargetBody) => { if (b !== body) { const first = targets.find((t) => t.body === b); if (first) onTarget(first.id) } }
  const profileDisabled = (p: Profile) => !p.bodies.includes(body)
  const purpose = profiles.profiles.find((p) => p.id === purposeId)
  const ready = !!target && !!purpose && !profileDisabled(purpose)

  const onListKey = (e: React.KeyboardEvent) => {
    const i = list.findIndex((t) => t.id === targetId)
    let j = i
    if (e.key === 'ArrowDown') j = Math.min(list.length - 1, i + 1)
    else if (e.key === 'ArrowUp') j = Math.max(0, i - 1)
    else if (e.key === 'Home') j = 0
    else if (e.key === 'End') j = list.length - 1
    else return
    e.preventDefault()
    onTarget(list[j].id)
  }

  return (
    <main id="main" className="picker">
      <h1 className="t-h1">Where on Earth can we rehearse the Moon and Mars?</h1>
      <p className="t-bodyLg muted2">No place on Earth is the Moon. So we find the smallest set of places that together are, and tell you exactly what Earth can't give you.</p>
      <div className="picker-grid">
        <section className="card picker-step" aria-labelledby="step1">
          <h2 id="step1" className="t-h3"><span className="step-n">1</span> Choose a destination</h2>
          <SegmentedControl label="Destination body" value={body} onChange={switchBody}
            options={[{ value: 'moon', label: <><span className="shape shape-moon" aria-hidden="true" /> Moon</> }, { value: 'mars', label: <><span className="shape shape-mars" aria-hidden="true" /> Mars</> }]} />
          <div className="picker-targets">
            <Locator body={body} targets={list} value={targetId} onSelect={onTarget} />
            <div className="target-list-wrap">
              <label className="sr-only" htmlFor="target-select">Target</label>
              <span className="select-wrap"><select id="target-select" className="target-select" value={targetId} onChange={(e) => onTarget(e.target.value)}>
                {(['moon', 'mars'] as const).map((b) => (
                  <optgroup key={b} label={b === 'moon' ? 'Moon' : 'Mars'}>
                    {targets.filter((t) => t.body === b).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                ))}
              </select></span>
              <p className="micro muted2 count">{list.length} targets</p>
              <ul ref={listRef} className="target-list" role="listbox" aria-label={`${body === 'moon' ? 'Moon' : 'Mars'} targets`} tabIndex={0}
                aria-activedescendant={`opt-${targetId}`} onKeyDown={onListKey}>
                {list.map((t) => (
                  <li key={t.id} id={`opt-${t.id}`} role="option" aria-selected={t.id === targetId} className={t.id === targetId ? 'sel' : ''} onClick={() => onTarget(t.id)}>
                    <span className={`shape shape-${t.body}`} aria-hidden="true" />
                    <span className="tl-text">
                      <span className="t-title">{t.name}</span>
                      <span className="t-small muted2">{targetMeta(t)} · {fmtLat(t.anchor.lat)}</span>
                    </span>
                    <span className="tl-badges">
                      {t.status && <span className="tag">{STATUS_BADGE[t.status]}</span>}
                      {!hasScorableFeatures(t) && <span className="tag tag-pending">No data yet</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {body === 'moon' && <p className="t-small muted2">Region centres are IAU feature anchors, not official NASA outlines.</p>}
        </section>

        <section className="card picker-step" aria-labelledby="step2">
          <h2 id="step2" className="t-h3"><span className="step-n">2</span> Choose a mission purpose</h2>
          <div className="purpose-grid" role="radiogroup" aria-label="Mission purpose">
            {profiles.profiles.map((p) => {
              const dis = profileDisabled(p)
              const ui = PURPOSE_UI[p.id as PurposeId]
              // short spec line on the card; the longer profiles.json rationale (disabled_for) as tooltip + aria-describedby
              const reason = dis ? (body === 'moon' ? 'Mars only. Not available for Moon targets.' : 'Moon only. Not available for Mars targets.') : undefined
              const why = dis ? p.disabled_for?.[body] : undefined
              return (
                <button key={p.id} type="button" role="radio" aria-checked={p.id === purposeId} aria-disabled={dis || undefined}
                  aria-describedby={dis ? `why-${p.id}${why ? ` whylong-${p.id}` : ''}` : undefined} title={why}
                  className={`purpose-card ${p.id === purposeId ? 'sel' : ''} ${dis ? 'dis' : ''}`}
                  onClick={() => !dis && onPurpose(p.id)}>
                  <Icon name={PURPOSE_ICON[p.id as PurposeId]} size={24} />
                  <span className="pc-text">
                    <span className="t-title">{purposeName(p)}</span>
                    <span className="t-small">{ui?.description}</span>
                    {dis ? <span id={`why-${p.id}`} className="t-small muted2">{reason}</span> : <span className="t-small muted2"><em>{ui?.campaign}</em></span>}
                    {why && <span id={`whylong-${p.id}`} className="sr-only">{why}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      </div>
      <div className="picker-cta">
        <button type="button" className="link-btn" onClick={onCustom} disabled={!ready}>Custom weights (advanced) →</button>
        <button type="button" className="btn btn-primary btn-lg" aria-disabled={!ready || undefined} aria-describedby={!ready ? 'cta-why' : undefined}
          onClick={() => ready && onGo()}>Find Earth analogs →</button>
        {!ready && <span id="cta-why" className="t-small muted2">Choose a destination and a purpose first.</span>}
      </div>
    </main>
  )
}

/** Small locator: Moon targets in a south-polar azimuthal view (82°S–90°S), Mars targets on an equirectangular frame. */
function Locator({ body, targets, value, onSelect }: { body: TargetBody; targets: Target[]; value: string; onSelect: (id: string) => void }) {
  const pts = useMemo(() => targets.map((t) => {
    if (body === 'moon') {
      const r = ((90 + t.anchor.lat) / 8) * 92 // 0 at the pole, 92 px at 82°S
      const a = (t.anchor.lon * Math.PI) / 180
      return { t, x: 100 + r * Math.sin(a), y: 100 + r * Math.cos(a) }
    }
    return { t, x: ((t.anchor.lon + 180) / 360) * 200, y: ((90 - t.anchor.lat) / 180) * 100 }
  }), [targets, body])
  return (
    <figure className="locator" aria-hidden="true">
      <svg viewBox={body === 'moon' ? '0 0 200 200' : '0 0 200 100'} width="100%">
        {body === 'moon' ? (
          <>
            {[92, 69, 46, 23].map((r) => <circle key={r} cx="100" cy="100" r={r} className="loc-grid" />)}
            <path d="M100 8v184M8 100h184" className="loc-grid" />
          </>
        ) : (
          <>
            <rect x="0.5" y="0.5" width="199" height="99" className="loc-grid" />
            <path d="M0 50h200M100 0v100" className="loc-grid" />
          </>
        )}
        {pts.map(({ t, x, y }) => (
          <g key={t.id} onClick={() => onSelect(t.id)} className="loc-pt">
            {t.body === 'moon'
              ? <circle cx={x} cy={y} r={t.id === value ? 6 : 4} className={t.id === value ? 'loc-sel' : 'loc-dot'} />
              : <rect x={x - (t.id === value ? 5 : 3.5)} y={y - (t.id === value ? 5 : 3.5)} width={t.id === value ? 10 : 7} height={t.id === value ? 10 : 7} transform={`rotate(45 ${x} ${y})`} className={t.id === value ? 'loc-sel' : 'loc-dot'} />}
          </g>
        ))}
      </svg>
      <figcaption className="micro muted2">{body === 'moon' ? 'Lunar south pole · 82°S to 90°S' : 'Mars · landing sites and Starship candidate landing sites'}</figcaption>
    </figure>
  )
}
