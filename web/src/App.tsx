import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_PURPOSE, DEFAULT_TARGET } from './copy'
import { fetchGridRaw, loadFactors, loadGaps, loadProfiles, loadTargets, loadValidation } from './data'
import { purposeName, targetShort } from './lib/format'
import { readUrl, writeUrl, type UrlState, type View } from './lib/url'
import { makeFactorText } from './lib/factors'
import type { FactorsFile, GapsFile, ProfilesFile, TargetsFile, ValidationFile } from './types/contract'
import { ScorerClient } from './worker/client'
import { knownCellsFrom } from './scoring/engine'
import Picker from './screens/Picker'
import { ErrorState, Logo } from './components/ui'

// Explore pulls in OpenLayers; Stub covers later screens. Both are split out of the entry chunk (a twin viewer route can follow the same pattern).
const Explore = lazy(() => import('./screens/Explore'))
const Stub = lazy(() => import('./screens/Stub'))
const About = lazy(() => import('./screens/About'))

const NAV: [View, string][] = [['explore', 'Explore'], ['reverse', 'Reverse search'], ['story', 'Story'], ['about', 'About & data']]

interface Data { targets: TargetsFile; profiles: ProfilesFile; factors: FactorsFile; gaps: GapsFile; validation: ValidationFile }

export default function App() {
  const [data, setData] = useState<Data | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [url, setUrl] = useState<UrlState>(readUrl)
  const urlRef = useRef(url)

  useEffect(() => {
    let live = true
    Promise.all([loadTargets(), loadProfiles(), loadFactors(), loadGaps(), loadValidation()])
      .then(([targets, profiles, factors, gaps, validation]) => live && setData({ targets, profiles, factors, gaps, validation }))
      .catch((e: unknown) => live && setLoadErr(String(e instanceof Error ? e.message : e)))
    return () => { live = false }
  }, [nonce])

  /* scorer worker: decode the Earth grid once */
  const [scorer, setScorer] = useState<ScorerClient | null>(null)
  const [scorerError, setScorerError] = useState<string | null>(null)
  const [nCells, setNCells] = useState<number | null>(null)
  const [scorerNonce, setScorerNonce] = useState(0)
  useEffect(() => {
    if (!data) return
    let live = true
    let client: ScorerClient | null = null
    fetchGridRaw('earth_features.json')
      .then(({ manifest, buffer }) => {
        if (!live) return
        const knownCells: [number, string][] = [...knownCellsFrom(data.validation)]
        client = new ScorerClient({ manifest, buffer, factors: data.factors, profiles: data.profiles, knownCells, constants: data.targets.scoring_constants })
        client.onCrash = (m) => live && setScorerError(m)
        return client.ready().then((n) => { if (live) { setNCells(n); setScorer(client) } })
      })
      .catch((e: unknown) => live && setScorerError(String(e instanceof Error ? e.message : e)))
    return () => { live = false; client?.terminate(); setScorer(null) }
  }, [data, scorerNonce])

  /* URL state */
  const update = useCallback((patch: Partial<UrlState>, replace = false) => {
    const next = { ...urlRef.current, ...patch }
    urlRef.current = next
    setUrl(next)
    writeUrl(next, replace)
  }, [])
  useEffect(() => {
    const on = () => { const u = readUrl(); urlRef.current = u; setUrl(u) }
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])

  const targets = useMemo(() => data?.targets.targets ?? [], [data])
  const target = targets.find((t) => t.id === url.t) ?? targets.find((t) => t.id === DEFAULT_TARGET) ?? targets[0]
  const profileOk = (id?: string) => data?.profiles.profiles.find((p) => p.id === id && target && p.bodies.includes(target.body))
  const profile = profileOk(url.p) ?? profileOk(DEFAULT_PURPOSE) ?? data?.profiles.profiles.find((p) => target && p.bodies.includes(target.body))

  const setTarget = (id: string) => {
    const t = targets.find((x) => x.id === id)
    const keepP = t && data?.profiles.profiles.find((p) => p.id === profile?.id)?.bodies.includes(t.body)
    update({ t: id, p: keepP ? profile?.id : DEFAULT_PURPOSE, site: undefined }, url.view === 'picker')
  }
  const setPurpose = (id: string) => update({ p: id, site: undefined }, url.view === 'picker')

  const [weightsReq, setWeightsReq] = useState(0)
  const [weightsSeen, setWeightsSeen] = useState(0)

  useEffect(() => {
    const base = 'Analog Portfolio · Earth places to rehearse the Moon and Mars'
    document.title = url.view === 'explore' && target && profile ? `${targetShort(target)} · ${purposeName(profile)} · Analog Portfolio` : base
  }, [url.view, target, profile])

  const ft = useMemo(() => (data ? makeFactorText(data.factors) : null), [data])
  // "?" opens the shortcut list (spec §9)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key !== '?' || el.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      history.pushState(null, '', `${window.location.pathname}?view=about#shortcuts`)
      const u = readUrl(); urlRef.current = u; setUrl(u)
      setTimeout(() => { const h = document.getElementById('shortcuts'); h?.scrollIntoView(); h?.focus() }, 300)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  const body = url.view === 'explore' || url.view === 'twin' ? target?.body : undefined
  const goHome = () => update({ view: 'picker', site: undefined, step: 'map' })

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <Logo body={body} onHome={goHome} />
        {url.view === 'explore' && data && target && profile && (
          <div className="context-pills">
            <label className="pill">
              <span className="sr-only">Target</span>
              <span className={`shape shape-${target.body}`} aria-hidden="true" />
              <select value={target.id} onChange={(e) => setTarget(e.target.value)}>
                {(['moon', 'mars'] as const).map((b) => (
                  <optgroup key={b} label={b === 'moon' ? 'Moon' : 'Mars'}>
                    {targets.filter((t) => t.body === b).map((t) => <option key={t.id} value={t.id}>{targetShort(t)}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="pill">
              <span className="sr-only">Purpose</span>
              <select value={profile.id} onChange={(e) => setPurpose(e.target.value)}>
                {data.profiles.profiles.map((p) => <option key={p.id} value={p.id} disabled={!p.bodies.includes(target.body)} title={p.disabled_for?.[target.body]}>{purposeName(p)}{!p.bodies.includes(target.body) ? ' (Mars only)' : ''}</option>)}
              </select>
            </label>
            <button type="button" className="pill pill-btn" onClick={() => setWeightsReq((n) => n + 1)}>{url.w ? 'Custom weights' : 'Adjust what counts'}</button>
          </div>
        )}
        <nav className="topnav" aria-label="Main">
          {NAV.map(([v, label]) => (
            <a key={v} href={`?view=${v}`} aria-current={url.view === v || (v === 'explore' && url.view === 'twin') ? 'page' : undefined}
              onClick={(e) => { e.preventDefault(); update({ view: v, ...(v === 'story' ? { s: undefined } : {}) }) }}>{label}</a>
          ))}
        </nav>
      </header>
      {loadErr ? (
        <main id="main" className="stub"><ErrorState title="Couldn't load the data." body="Check your connection and try again." detail={loadErr} onRetry={() => { setLoadErr(null); setNonce((n) => n + 1) }} /></main>
      ) : !data || !target || !profile ? (
        <main id="main" className="stub" aria-busy="true"><p className="t-body muted2">Loading…</p></main>
      ) : url.view === 'picker' ? (
        <Picker targets={targets} profiles={data.profiles} targetId={target.id} purposeId={profile.id} onTarget={setTarget} onPurpose={setPurpose}
          onGo={() => update({ view: 'explore', t: target.id, p: profile.id, step: 'map', site: undefined })}
          onCustom={() => { setWeightsReq((n) => n + 1); update({ view: 'explore', t: target.id, p: profile.id, step: 'map', site: undefined }) }} />
      ) : (
        <Suspense fallback={<main id="main" className="stub" aria-busy="true"><p className="t-body muted2">Loading…</p></main>}>
          {url.view === 'explore' ? (
            <Explore target={target} profile={profile} profiles={data.profiles} factors={data.factors} gaps={data.gaps} validation={data.validation} earthRef={data.targets.earth_reference}
              mock={!!data.targets.mock} scorer={scorer} scorerError={scorerError} nCells={nCells} url={url} update={update}
              onRetryScorer={() => { setScorerError(null); setScorerNonce((n) => n + 1) }} onChangeTarget={() => update({ view: 'picker' })}
              weightsReq={weightsReq} weightsSeen={weightsSeen} onWeightsSeen={setWeightsSeen} />
          ) : url.view === 'about' ? (
            <About factors={data.factors} ft={ft!} profiles={data.profiles} validation={data.validation} mock={!!data.targets.mock} />
          ) : (
            <Stub view={url.view} onBack={goHome} />
          )}
        </Suspense>
      )}
    </>
  )
}
