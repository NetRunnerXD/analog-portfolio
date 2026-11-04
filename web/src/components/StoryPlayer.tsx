import { useCallback, useEffect, useRef, useState } from 'react'
import { loadPortfolio } from '../data'
import { portfolioCaption, STORY_MOON, STORY_STEPS, validationCaption } from '../lib/story'
import type { Portfolio, Target, ValidationFile } from '../types/contract'
import { createPane, type Pane } from '../map/twinPane'
import './story.css'

const BASE = import.meta.env.BASE_URL
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Spec §11.11 StoryPlayer: step chip top-right, caption + controls in the bottom 20% band, credit strip on steps 4–6.
 * Steps 1–3 and 7 are full-bleed; 4–6 show the live app underneath (App renders the scene from lib/story).
 * Space play/pause, ←/→ step, C captions, Esc exit. Reduced motion: starts paused, no fades.
 */
export default function StoryPlayer({ step, onStep, onHalf, onExit, targets, purpose, validation, earthR }: {
  step: number; onStep: (s: number) => void; onHalf: (h: number) => void; onExit: () => void
  targets: Target[]; purpose: string; validation: ValidationFile; earthR: number
}) {
  const [playing, setPlaying] = useState(() => !reduced())
  const [captions, setCaptions] = useState(true)
  const [half, setHalfState] = useState(0)
  const setHalf = useCallback((h: number) => { setHalfState(h); onHalf(h) }, [onHalf])
  const [pf, setPf] = useState<Portfolio | null>(null)
  useEffect(() => { loadPortfolio(STORY_MOON, purpose).then(setPf, () => setPf(null)) }, [purpose])

  // timeline
  const go = useCallback((s: number) => { setHalf(0); onStep(Math.min(7, Math.max(1, s))) }, [onStep, setHalf])
  useEffect(() => {
    if (!playing) return
    const d = STORY_STEPS[step - 1].ms
    const ids: number[] = []
    if (step === 5 || step === 6) ids.push(window.setTimeout(() => setHalf(1), d / 2))
    ids.push(window.setTimeout(() => (step < 7 ? go(step + 1) : setPlaying(false)), d))
    return () => ids.forEach(clearTimeout)
  }, [playing, step, go, setHalf])

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(step + 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(step - 1) }
      else if (e.key === 'c' || e.key === 'C') setCaptions((c) => !c)
      else if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [step, go, onExit])

  // steps 1 and 2: Moon south pole and Earth from the twin-viewer pane (Trek / GIBS tiles)
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!el.current || (step !== 1 && step !== 2)) return
    const t = targets.find((x) => x.id === STORY_MOON)
    const w = el.current.clientWidth || 1440
    let pane: Pane | null = null
    pane = step === 1 && t
      ? createPane({ target: el.current, body: 'moon', lat: t.anchor.lat, lon: t.anchor.lon, earthR, resolution: 160000 / w, footprint: [], pin: { body: 'moon' }, onTiles: () => {} })
      : createPane({ target: el.current, body: 'earth', lat: 20, lon: 0, earthR, resolution: (2.4 * earthR) / (el.current.clientHeight || 900), footprint: [], onTiles: () => {} })
    return () => pane?.dispose()
  }, [step, targets, earthR])

  const wide = typeof window !== 'undefined' && window.innerWidth / window.innerHeight > 1.7
  const size = wide ? '1920x1080' : '1440x900'
  const valCap = validationCaption(validation, STORY_MOON, purpose)
  const caption = [
    "NASA's first Moon Base lander is headed here.",
    'Where on Earth can we rehearse it?',
    'No place on Earth is the Moon. We find the smallest set of places that together are.',
    'Every land area on Earth, scored on 10 factors.',
    half === 0 ? `${portfolioCaption(pf) ?? ''} Earth can't give one-sixth gravity, vacuum or ~40 K shadows.`.trim() : valCap ?? '',
    'New analogs, characterised factor by factor.',
    'Plan analog campaigns from anywhere.',
  ][step - 1]
  const full = step <= 3 || step === 7
  const url = new URL(BASE, location.href).href.replace(/\/$/, '')

  return (
    <div className={`story ${full ? 'story-full' : 'story-over'} ${reduced() ? '' : 'story-anim'}`} role="region" aria-label="Story mode" aria-roledescription="slideshow">
      {(step === 1 || step === 2) && <div key={step} ref={el} className="story-map" aria-hidden="true" />}
      {step === 3 && <img key="t" className="story-card" alt={captions ? '' : caption} src={`${BASE}story/story-title-${size}${captions ? '-bg.png' : '.svg'}`} />}
      {step === 7 && (
        <div className="story-card-wrap">
          <img className="story-card" alt="" src={`${BASE}story/story-end-${size}-bg.png`} />
          <div className={`story-end story-end-${size}`}>
            <img src={`${BASE}brand/analog-portfolio-lockup-dark.svg`} alt="Analog Portfolio" />
            <p className="t-h1">Plan analog campaigns from anywhere.</p>
            <a className="story-url" href={BASE}>{url.replace(/^https?:\/\//, '')}</a>
          </div>
        </div>
      )}
      {step >= 4 && step <= 6 && <p className="story-credits t-small">NASA LOLA · Diviner · MOLA · TES · POWER · ESA Copernicus</p>}
      <p className="story-chip t-label" aria-live="polite">Story · {step} of 7 · {STORY_STEPS[step - 1].chip}</p>
      <div className="story-band">
        {captions && step !== 7 && caption && <p key={`${step}-${half}`} className="story-caption" aria-live="polite">{caption}</p>}
        <div className="story-controls">
          <button className="btn" onClick={() => go(step - 1)} disabled={step === 1}>Previous</button>
          <button className="btn primary" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>{playing ? 'Pause' : 'Play'}</button>
          <button className="btn" onClick={() => go(step + 1)} disabled={step === 7}>Next</button>
          <button className="btn" onClick={() => setCaptions((c) => !c)} aria-pressed={captions}>Captions {captions ? 'on' : 'off'}</button>
          <button className="btn" onClick={onExit}>Exit story ✕ (Esc)</button>
        </div>
      </div>
    </div>
  )
}
