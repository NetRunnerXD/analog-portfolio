// Every state is linkable (LAYOUT.md §4.2): ?view=explore&t=<target>&p=<profile>&v=<variant>&step=portfolio&site=<id>&w=F1.20,F2.20…
import { CORE_FACTORS, VARIANT_IDS } from '../types/contract'
import type { VariantId } from '../types/contract'

export type View = 'picker' | 'explore' | 'about' | 'reverse' | 'story'
export type Step = 'map' | 'portfolio'
export interface UrlState { view: View; t?: string; p?: string; v: VariantId; step: Step; site?: string; w?: Record<string, number> }

const VIEWS: View[] = ['picker', 'explore', 'about', 'reverse', 'story']

export function parseWeights(s: string | null): Record<string, number> | undefined {
  if (!s) return undefined
  const out: Record<string, number> = {}
  for (const part of s.split(',')) {
    const [f, v] = part.split('.')
    if ((CORE_FACTORS as string[]).includes(f) && /^\d+$/.test(v)) out[f] = Number(v)
  }
  return Object.keys(out).length ? out : undefined
}
export const encodeWeights = (w: Record<string, number>) => CORE_FACTORS.map((f) => `${f}.${w[f] ?? 0}`).join(',')

export function readUrl(): UrlState {
  const q = new URLSearchParams(window.location.search)
  const view = (VIEWS as string[]).includes(q.get('view') ?? '') ? (q.get('view') as View) : 'picker'
  const v = (VARIANT_IDS as string[]).includes(q.get('v') ?? '') ? (q.get('v') as VariantId) : 'best_match'
  return { view, t: q.get('t') ?? undefined, p: q.get('p') ?? undefined, v, step: q.get('step') === 'portfolio' ? 'portfolio' : 'map', site: q.get('site') ?? undefined, w: parseWeights(q.get('w')) }
}

export function writeUrl(s: UrlState, replace = false) {
  const q = new URLSearchParams()
  if (s.view !== 'picker') q.set('view', s.view)
  if (s.t) q.set('t', s.t)
  if (s.p) q.set('p', s.p)
  if (s.view === 'explore') {
    if (s.v !== 'best_match') q.set('v', s.v)
    if (s.step === 'portfolio') q.set('step', 'portfolio')
    if (s.site) q.set('site', s.site)
    if (s.w) q.set('w', encodeWeights(s.w))
  }
  const qs = q.toString()
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`
  if (url === `${window.location.pathname}${window.location.search}`) return
  if (replace) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
}
