import { FACTOR_UI, PURPOSE_UI } from '../copy'
import type { FactorId, FactorsFile, Profile, PurposeId, SiteRef, Target } from '../types/contract'
import { CORE_FACTORS } from '../types/contract'

export type Band = 'Weak' | 'Partial' | 'Good' | 'Strong'
/** S × 100 → word band (spec §7): 0–39 Weak · 40–59 Partial · 60–79 Good · 80–100 Strong */
export const band = (score100: number): Band => (score100 >= 80 ? 'Strong' : score100 >= 60 ? 'Good' : score100 >= 40 ? 'Partial' : 'Weak')
export const to100 = (s: number) => Math.round(s * 100)

export const fmtLat = (lat: number, d = 2) => `${Math.abs(lat).toFixed(d)}°${lat < 0 ? 'S' : 'N'}`
export const fmtLon = (lon: number, d = 2) => `${Math.abs(lon).toFixed(d)}°${lon < 0 ? 'W' : 'E'}`
export const fmtLatLon = (lat: number, lon: number, d = 2) => `${fmtLat(lat, d)} ${fmtLon(lon, d)}`
/** 0.5° cell east–west width in km (factcheck #11/#12): round(55.6 × cos(lat)) */
export const cellEwKm = (lat: number) => Math.round(55.6 * Math.cos((lat * Math.PI) / 180))

/** Access copy from travel_time_min (spec §8.4 SiteListCard / §11.3). */
export function accessText(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min)) return 'travel time unknown'
  if (min < 60) return '< 1 h from a city of 50k+'
  const h = Math.round(min / 60)
  if (h <= 48) return `~${h} h from a city of 50k+`
  const d = Math.round(min / 1440)
  return d > 2 ? '> 2 days from a city of 50k+' : `~${d} days from a city of 50k+`
}

export const purposeName = (p: Profile | undefined, id?: string) => p?.display_name ?? PURPOSE_UI[(p?.id ?? id) as PurposeId]?.name ?? p?.name ?? id ?? ''
export const purposeShort = (p: Profile | undefined, id?: string) => p?.display_short ?? PURPOSE_UI[(p?.id ?? id) as PurposeId]?.short ?? purposeName(p, id)
export const targetShort = (t: Target | undefined) => (t ? t.short_name ?? t.name.split(' (')[0] : '')
export const targetMeta = (t: Target) => t.description ?? (t.role.split(';')[0] ?? t.role)

type Placeable = Pick<SiteRef, 'name' | 'site_id' | 'lat' | 'lon' | 'known_analog' | 'country' | 'region' | 'admin1'>

/** "Region, Country" from the site's admin-1 region and country, when the data has them (else null). */
export function placeName(s: Partial<Placeable>): string | null {
  const region = s.region ?? s.admin1 ?? null
  const country = s.country ?? null
  if (region && country) return region === country ? country : `${region}, ${country}`
  return country ?? region ?? null
}

/**
 * Site title: a known analog keeps its validation.csv name; other sites use "Region, Country" when present, and fall back
 * to "Earth site at {lat lon}" for unnamed candidate cells (v1.1 mocks carry no place names).
 */
export function siteTitle(s: Placeable): string {
  if (s.known_analog) return s.known_analog
  const place = placeName(s)
  if (place) return place
  if (s.site_id.startsWith('cell_') || s.name.startsWith('Candidate cell')) return `Earth site at ${fmtLatLon(s.lat, s.lon, 1)}`
  return s.name
}

/**
 * Titles that stay distinct within a list: when several sites share a title (e.g. five Antarctic cells all titled
 * "Antarctica" because Antarctica has no admin-1 regions), each gets its cell centre appended: "Antarctica · 77.8°S 162.3°E".
 */
export function makeTitler(sites: Iterable<Placeable>): (s: Placeable) => string {
  const count = new Map<string, Set<string>>()
  for (const s of sites) { const t = siteTitle(s); if (!count.has(t)) count.set(t, new Set()); count.get(t)!.add(s.site_id) }
  return (s) => {
    const t = siteTitle(s)
    return (count.get(t)?.size ?? 0) > 1 && !t.startsWith('Earth site at') ? `${t} · ${fmtLatLon(s.lat, s.lon, 1)}` : t
  }
}

/** Share of the weighted needs with Earth data in this cell (contract §3.2.6), 0–1. Null/NaN factor scores are missing. */
export function dataCoverage(fs: Partial<Record<FactorId, number | null>>, weights: Record<string, number>, needs: FactorId[]): number {
  let all = 0
  let present = 0
  for (const f of needs) {
    const w = weights[f] ?? 0
    all += w
    const v = fs[f]
    if (v !== null && v !== undefined && !Number.isNaN(v)) present += w
  }
  return all > 0 ? present / all : 1
}

export const factorWeightActive = (weights: Record<string, number>, f: FactorId) => (weights[f] ?? 0) > 0

/** Physical value formatter for factor rows ("Site {x} · target {y}"). Units/classes come from factors.json. */
export function makeValueFormatter(factors: FactorsFile) {
  const lith = new Map(factors.lithology_classes.map((c) => [c.code, c.name]))
  const flags = factors.geomorph_flags
  const f3 = factors.factors.find((f) => f.id === 'F3')
  const classNames = new Map<number, string>()
  for (const m of (f3?.units ?? '').matchAll(/(\d)\s+([a-z]+)/g)) classNames.set(Number(m[1]), m[2])
  return (f: FactorId, v: number | null | undefined): string => {
    if (v === null || v === undefined || !Number.isFinite(v)) return 'no data'
    switch (f) {
      case 'F1': case 'F2': return `${Math.round(v)} K`
      case 'F3': return classNames.get(Math.round(v)) ?? `class ${Math.round(v)}`
      case 'F4': return `${Math.round(v * 100)}% under 5°`
      case 'F5': return v >= 1000 ? `${(v / 1000).toFixed(1)} km` : `${Math.round(v)} m`
      case 'F6': return (lith.get(Math.round(v)) ?? `class ${v}`).toLowerCase()
      case 'F7': return `aridity ${v.toFixed(2)}`
      case 'F8': return `${Math.round(v * 100)}% bare`
      case 'F9': return `ice index ${v.toFixed(2)}`
      case 'F10': return `${v.toFixed(1)}° noon sun`
      case 'F11': return `${Math.round(v)} g/cm²`
      case 'F12': return `UV ${v.toFixed(1)}`
      case 'F13': { const names = flags.filter((x) => (Math.round(v) & x.bit) !== 0).map((x) => x.name.toLowerCase()); return names.length ? names.join(', ') : 'none' }
      default: return String(v)
    }
  }
}

/** A difference in a factor's units ("short by …"). */
export function makeDeltaFormatter(factors: FactorsFile) {
  const fmt = makeValueFormatter(factors)
  return (f: FactorId, d: number): string => {
    if (!Number.isFinite(d)) return 'no data'
    switch (f) {
      case 'F4': case 'F8': return `${Math.round(d * 100)} percentage points`
      case 'F10': return `${d.toFixed(1)}° of sun height`
      case 'F7': case 'F9': return d.toFixed(2)
      default: return fmt(f, d)
    }
  }
}

/** Unit words for screen readers. */
export const factorUnitWord = (f: FactorId) => (f === 'F1' || f === 'F2' ? 'kelvin' : '')

/** One-sentence summary (spec §7): Like {targetShort}, it {good(top1)}{, and {good(top2)}}. {Its|But it} {weak(worst)}. */
export function summarySentence(tShort: string, weights: Record<string, number>, fs: Partial<Record<FactorId, number | null>>, gaps: Partial<Record<FactorId, number>>): string {
  const act = (Object.keys(weights) as FactorId[]).filter((f) => weights[f] > 0 && fs[f] !== undefined && fs[f] !== null)
  if (!act.length) return ''
  const goods = act.filter((f) => (fs[f] as number) >= 0.75).sort((a, b) => weights[b] - weights[a] || (fs[b] as number) - (fs[a] as number)).slice(0, 2)
  const worst = [...act].sort((a, b) => weights[a] * Math.log(Math.max(fs[a] as number, 0.01)) - weights[b] * Math.log(Math.max(fs[b] as number, 0.01)))[0]
  const tail = (f: FactorId) => ((gaps[f] ?? 0) > 0 ? ", which Earth can't match" : '')
  let out = ''
  if (goods.length) out = `Like ${tShort}, it ${FACTOR_UI[goods[0]].good}${tail(goods[0])}${goods[1] ? `, and ${FACTOR_UI[goods[1]].good}${tail(goods[1])}` : ''}.`
  if (worst && !goods.includes(worst) && (fs[worst] as number) < 0.75) out += `${out ? ' But it' : ' It'} ${FACTOR_UI[worst].weak}${tail(worst)}.`
  return out.trim()
}

/** A target is scored only when none of its core factors is still "pending" (12 of 18 mock targets carry only body-level
 * defaults for F6–F9 and pending F1–F5/F10; scoring them on those alone would mislead, so they show "No data yet"). */
export const hasScorableFeatures = (t: Target) => {
  const f = t.features ?? {}
  return CORE_FACTORS.some((k) => f[k]?.value !== null && f[k]?.value !== undefined) && !CORE_FACTORS.some((k) => f[k]?.source === 'pending')
}
/** "Covered at Earth's limit": the target value is beyond Earth's P0.5–P99.5 range for this factor (targets.json gap > 0). */
export const isAtLimit = (t: Target, f: FactorId) => {
  const fv = t.features?.[f]
  if (!fv) return false
  if (fv.value !== null && fv.value !== undefined && fv.t_star !== null && fv.t_star !== undefined) return Math.abs(fv.value - fv.t_star) > 1e-9
  return (fv.gap ?? 0) !== 0 // sign-agnostic: a gap is a shortfall either way
}
