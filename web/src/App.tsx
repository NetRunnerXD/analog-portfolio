import { useEffect, useMemo, useState } from 'react'
import MapView from './components/MapView'
import { DATA_ROOT, loadFactors, loadGaps, loadPortfolio, loadProfiles, loadTargets } from './data'
import type { FactorsFile, GapsFile, Portfolio, ProfilesFile, SiteRef, Target } from './types/contract'

type Variant = Portfolio['variants'][number]['id']

export default function App() {
  const [targets, setTargets] = useState<Target[]>([])
  const [profiles, setProfiles] = useState<ProfilesFile | null>(null)
  const [factors, setFactors] = useState<FactorsFile | null>(null)
  const [gaps, setGaps] = useState<GapsFile | null>(null)
  const [targetId, setTargetId] = useState('moon_shackleton_connecting_ridge')
  const [profileId, setProfileId] = useState('P3_habitat_eva_power')
  const [variant, setVariant] = useState<Variant>('fidelity')
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<SiteRef | null>(null)

  useEffect(() => {
    Promise.all([loadTargets(), loadProfiles(), loadFactors(), loadGaps()])
      .then(([t, p, f, g]) => { setTargets(t.targets); setProfiles(p); setFactors(f); setGaps(g) })
      .catch((e: Error) => setError(e.message))
  }, [])

  const target = targets.find((t) => t.id === targetId)
  const profile = profiles?.profiles.find((p) => p.id === profileId)
  const profileDisabled = !!(target && profile && !profile.bodies.includes(target.body))

  useEffect(() => {
    setPortfolio(null)
    setSelected(null)
    if (!target || profileDisabled) return
    loadPortfolio(targetId, profileId)
      .then((p) => { setPortfolio(p); setError(null) })
      .catch(() => setError(`No portfolio yet for ${targetId} × ${profileId}${DATA_ROOT.includes('mock') ? ' (mock data covers 6 targets)' : ''}.`))
  }, [targetId, profileId, target, profileDisabled])

  const factorName = useMemo(() => Object.fromEntries((factors?.factors ?? []).map((f) => [f.id, f.ui_label ?? f.name])), [factors])
  const fmt = (v: unknown) => (v === null || v === undefined ? 'n/a' : Array.isArray(v) ? v.join('–') : String(v))
  const sites = portfolio?.variants.find((v) => v.id === variant)?.sites ?? []

  return (
    <div className="app">
      <header>
        <h1>Analog Portfolio</h1>
        <p className="tagline">No place on Earth is the Moon. We find the smallest set of places that together are, and say exactly what Earth can't give you.</p>
        {DATA_ROOT.includes('mock') && <span className="badge" title="Synthetic values in the contract shape">MOCK DATA</span>}
      </header>

      <section className="controls" aria-label="Mission inputs">
        <label>
          Target
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {(['moon', 'mars'] as const).map((b) => (
              <optgroup key={b} label={b === 'moon' ? 'Moon (south pole)' : 'Mars'}>
                {targets.filter((t) => t.body === b).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          Mission purpose
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            {profiles?.profiles.map((p) => (
              <option key={p.id} value={p.id} disabled={!!target && !p.bodies.includes(target.body)}>{p.code} · {p.name}</option>
            ))}
          </select>
        </label>
        <label>
          Variant
          <select value={variant} onChange={(e) => setVariant(e.target.value as Variant)}>
            <option value="fidelity">Highest fidelity</option>
            <option value="balanced">Balanced</option>
            <option value="accessible">Most accessible</option>
          </select>
        </label>
      </section>

      <main>
        <MapView cells={portfolio?.top_cells ?? []} portfolio={sites} onSelect={setSelected} />
        <aside>
          {target && (
            <div className="card">
              <h2>{target.name}</h2>
              <p className="muted">{target.body.toUpperCase()} · {target.anchor.lat.toFixed(2)}°, {target.anchor.lon.toFixed(2)}°E · <a href={target.anchor.source_url} target="_blank" rel="noreferrer">anchor source</a></p>
              <p className="muted">{target.role}</p>
            </div>
          )}
          {profileDisabled && profile && <p className="warn">{profile.disabled_for?.[target!.body] ?? 'Profile not available for this body.'}</p>}
          {error && <p className="warn">{error}</p>}
          {portfolio && (
            <div className="card">
              <h2>Portfolio ({sites.length} sites)</h2>
              <ol className="portfolio">
                {sites.map((s) => (
                  <li key={s.site_id} onClick={() => setSelected(s)}>
                    <strong>{s.name}</strong> <span className="muted">S = {s.score.toFixed(2)}</span>
                    <div className="chips">{s.covers.map((f) => <span key={f} className="chip" title={factorName[f]}>{f}</span>)}</div>
                  </li>
                ))}
              </ol>
              {portfolio.uncoverable.length > 0 && <p className="muted">No Earth site covers: {portfolio.uncoverable.map((f) => factorName[f]).join(', ')}</p>}
            </div>
          )}
          {selected && (
            <div className="card">
              <h3>{selected.name}</h3>
              {Object.entries(selected.factor_scores).map(([f, v]) => (
                <div key={f} className="bar" title={factorName[f]}>
                  <span>{f}</span>
                  <div><i style={{ width: `${Math.round((v ?? 0) * 100)}%` }} /></div>
                  <span>{(v ?? 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
          {gaps && target && (
            <div className="card">
              <h2>Fidelity gap: what Earth can't give you</h2>
              {gaps.tiers.never_on_earth.gaps.filter((g) => g.values[target.body] !== undefined && g.values[target.body] !== null).map((g) => (
                <details key={g.id}>
                  <summary><strong>{g.label}</strong>: {fmt(g.values[target.body])} vs Earth {fmt(g.values.earth)} {g.values.unit}</summary>
                  <p className="muted">{g.handling}</p>
                  <p className="muted">Fill with: {g.example_facilities.map((f) => gaps.facilities[f]?.name ?? f).join('; ')}</p>
                </details>
              ))}
              <p className="muted">Beyond Earth's range (scored up to Earth's extreme): {gaps.tiers.beyond_earth_range.gaps.map((g) => g.label).join(' · ')}</p>
            </div>
          )}
        </aside>
      </main>
      <footer className="muted">NASA Space Apps 2026 · Data: NASA, USGS, ESA and partners (see Data sources) · Code Apache-2.0</footer>
    </div>
  )
}
