import { useEffect, useState } from 'react'
import { loadProvenance } from '../data'
import type { FactorText } from '../lib/factors'
import type { FactorsFile, ProfilesFile, ProvenanceFile, ProvenanceLayer, ValidationFile } from '../types/contract'
import { CORE_FACTORS, SECONDARY_FACTORS } from '../types/contract'
import { AI_LOG_URL, APP_CREDITS, CAMPAIGN_SOURCES, PHYSICAL_SOURCES, PLANNED, SHORTCUTS, type Credit } from '../content/sources'
import { purposeName } from '../lib/format'
import ValidationHeadline from '../components/ValidationHeadline'
import { httpUrl } from '../lib/format'
import './about.css'

const GROUPS: [string, string][] = [['nasa', 'NASA'], ['partner', 'Partner agencies (ESA, JAXA)'], ['other', 'Other']]
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }

/** About & data (spec §11.12). Credits come from provenance.json; the copy is the spec's. */
export default function About({ factors, ft, profiles, validation, mock }: { factors: FactorsFile; ft: FactorText; profiles: ProfilesFile; validation: ValidationFile; mock: boolean }) {
  const [prov, setProv] = useState<ProvenanceFile | null>(null)
  const [provErr, setProvErr] = useState<string | null>(null)
  useEffect(() => { loadProvenance().then(setProv).catch((e: unknown) => setProvErr(String(e instanceof Error ? e.message : e))) }, [])
  useEffect(() => { if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView() }, [])
  const real = prov && !prov.mock ? prov.layers.filter((l) => l.agency_group) : []
  const mc = profiles.defaults.monte_carlo
  const vs = validation.summary as { n_known?: number; n_negative?: number }
  return (
    <main id="main" className="about">
      <article>
        <h1 className="t-h1">About &amp; data</h1>
        <p className="t-bodyLg">Analog Portfolio finds the smallest set of Earth places that together match a Moon or Mars destination for a mission purpose, and lists what Earth can't match.</p>

        <section aria-labelledby="h-how">
          <h2 id="h-how" className="t-h2">How scoring works</h2>
          <p>Each 0.5° land cell gets a 0–100 score per factor by comparing it with the destination, then a weighted average for the purpose. Weights were fixed and committed before any scoring.</p>
          <ul className="about-list">
            <li><strong>{CORE_FACTORS.length} factors:</strong> {CORE_FACTORS.map((f) => ft.label(f)).join(' · ')}. Tie-breakers ({SECONDARY_FACTORS.map((f) => ft.label(f)).join(' · ')}) only nudge the score, by up to 10%.</li>
            <li><strong>Purposes:</strong> {profiles.profiles.map((p) => purposeName(p)).join(' · ')}. Each one weights the factors differently; you can change the weights, and everything is recalculated in your browser.</li>
            <li><strong>Portfolio:</strong> a greedy set cover picks 2–{profiles.defaults.portfolio_max_sites} Earth sites so that together they cover every need (a factor with weight above 0) Earth can meet. A site covers a need when it scores {Math.round((profiles.defaults.theta) * 100)} or more on it.</li>
            <li><strong>Robustness:</strong> {mc.rule ?? `each site is re-tested under ${mc.draws.toLocaleString('en')} random weightings`}.</li>
            <li><strong>Validation:</strong> {vs.n_known ?? '…'} well-known analog sites and {vs.n_negative ?? '…'} non-analog controls, checked after the weights were frozen. <ValidationHeadline validation={validation} /> The Validation tab of each site shows the result for your target and purpose.</li>
            <li><strong>Fidelity gap:</strong> what no Earth site can give (gravity, vacuum, radiation, and anything beyond Earth's range), with the facility that fills it.</li>
          </ul>
        </section>

        <section aria-labelledby="h-limits">
          <h2 id="h-limits" className="t-h2">Limits</h2>
          <p>Scores describe broad regions (0.5° cells, up to ~55 km across), not exact spots. Ground and rock types are compared as classes within each world, not as exact physics. New candidates need field confirmation.</p>
          {mock && <p className="tag">Illustrative mock data: every score in this build comes from a synthetic grid, not real measurements.</p>}
        </section>

        <section aria-labelledby="h-credits">
          <h2 id="h-credits" className="t-h2">Data credits</h2>
          {provErr && <p className="t-small muted2">Couldn't load provenance.json ({provErr}).</p>}
          {real.length > 0 ? (
            GROUPS.map(([g, title]) => {
              const ls = real.filter((l) => (g === 'other' ? !['nasa', 'partner'].includes(l.agency_group) : l.agency_group === g))
              return ls.length ? <ProvTable key={g} title={title} layers={ls} /> : null
            })
          ) : (
            <>
              <p className="t-small muted2">This build runs on mock data, so <code>provenance.json</code> lists no real layers yet. These are the sources planned for the real release (from DATA_LICENSES.md); each licence is checked against the provider's terms before release. The real release lists the exact layers, versions and licences used.</p>
              {GROUPS.map(([g, title]) => <CreditTable key={g} title={title} rows={PLANNED.filter((c) => c.group === g)} planned />)}
            </>
          )}
        </section>

        <section aria-labelledby="h-app">
          <h2 id="h-app" className="t-h2">Maps, imagery and software in this app</h2>
          <CreditTable title="Used by the web app" rows={APP_CREDITS} />
          <p className="t-small muted2">No NASA logos or mission insignia are used. Use of NASA data does not imply endorsement by NASA, JPL or Caltech.</p>
        </section>

        <section aria-labelledby="h-phys">
          <h2 id="h-phys" className="t-h2">Physical sources</h2>
          <ul className="about-list">{PHYSICAL_SOURCES.map((s) => <li key={s.text}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.text}</a> : s.text}</li>)}</ul>
        </section>

        <section aria-labelledby="h-camp">
          <h2 id="h-camp" className="t-h2">Campaign sources</h2>
          <ul className="about-list">{CAMPAIGN_SOURCES.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.text}</a> <span className="micro muted2">({host(s.url)})</span></li>)}</ul>
        </section>

        <section aria-labelledby="h-ai">
          <h2 id="h-ai" className="t-h2">AI use</h2>
          <p>This project was built with AI assistance (research, data plumbing, code and copy). Every AI contribution is logged with what it produced and who reviewed it in the <a href={AI_LOG_URL} target="_blank" rel="noreferrer">AI-use log</a>.</p>
        </section>

        <section aria-labelledby="shortcuts">
          <h2 id="shortcuts" className="t-h2" tabIndex={-1}>Keyboard shortcuts</h2>
          <table className="about-table">
            <caption className="sr-only">Keyboard shortcuts</caption>
            <thead><tr><th scope="col">Where</th><th scope="col">Keys</th></tr></thead>
            <tbody>{SHORTCUTS.map(([w, k]) => <tr key={w}><th scope="row">{w}</th><td>{k}</td></tr>)}</tbody>
          </table>
        </section>
        <p className="t-small muted2">Data contract v{profiles.contract_version} · {factors.factors.length} factor definitions from factors.json.</p>
      </article>
    </main>
  )
}

function ProvTable({ title, layers }: { title: string; layers: ProvenanceLayer[] }) {
  return (
    <div className="credit-block">
      <h3 className="t-title">{title}</h3>
      <div className="table-scroll" role="region" aria-label={`${title} data layers`} tabIndex={0}>
        <table className="about-table">
          <thead><tr><th scope="col">Dataset</th><th scope="col">Provider</th><th scope="col">Licence</th><th scope="col">Used for</th></tr></thead>
          <tbody>{layers.map((l) => (
            <tr key={l.id}>
              <th scope="row">{httpUrl(l.url) ? <a href={l.url ?? undefined} target="_blank" rel="noreferrer">{l.dataset}</a> : l.dataset}{l.version ? <span className="micro muted2"> v{l.version}</span> : null}{l.citation && l.citation !== 'n/a' ? <span className="t-small muted2 block">{l.citation}</span> : null}</th>
              <td>{l.provider}</td><td>{l.license ?? '—'}</td><td>{l.how_used ?? '—'}{l.factors?.length ? <span className="micro muted2 block">{l.factors.join(', ')}</span> : null}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

function CreditTable({ title, rows, planned }: { title: string; rows: Credit[]; planned?: boolean }) {
  if (!rows.length) return null
  return (
    <div className="credit-block">
      <h3 className="t-title">{title}</h3>
      <div className="table-scroll" role="region" aria-label={`${title} credits`} tabIndex={0}>
        <table className="about-table">
          <thead><tr><th scope="col">Dataset</th><th scope="col">Provider</th><th scope="col">Licence / terms</th><th scope="col">Credit line</th></tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.dataset}>
              <th scope="row">{httpUrl(c.url) ? <a href={c.url} target="_blank" rel="noreferrer">{c.dataset}</a> : c.dataset}</th>
              <td>{c.provider}</td>
              <td>{c.licence}{planned || !c.verified ? <span className="micro muted2 block">being confirmed</span> : null}</td>
              <td className="t-small">{c.attribution ?? '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}
