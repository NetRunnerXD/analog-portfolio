import { fmtLatLon } from './format'

/** Natural Earth 10m populated places (public/geo/places.json), fetched on first focus of the search box. */
export interface Place { ne_id: number; name: string; name_ascii: string; admin1: string | null; country: string; lat: number; lon: number; pop_max: number }
let placesP: Promise<Place[]> | null = null
export function loadPlaces(): Promise<Place[]> {
  if (placesP) return placesP
  // Only a successful load is cached: a failure clears the slot so the next focus / call fetches again.
  const p: Promise<Place[]> = fetch(`${import.meta.env.BASE_URL}geo/places.json`)
    .then(async (r) => { if (!r.ok) throw new Error(`places.json: HTTP ${r.status}`); return decodePlaces(await r.json()) })
    .catch((e: unknown) => { if (placesP === p) placesP = null; throw e })
  placesP = p
  return p
}
/** places.json is columnar: { fields: [...], rows: [[...]] } (scripts/build_places.py). */
export function decodePlaces(f: { fields: string[]; rows: unknown[][] }): Place[] {
  const ix = (k: string) => f.fields.indexOf(k)
  const [a, b, c, d, e, g, h, k] = ['ne_id', 'name', 'name_ascii', 'admin1', 'country', 'lat', 'lon', 'pop_max'].map(ix)
  return f.rows.map((r) => ({ ne_id: r[a] as number, name: r[b] as string, name_ascii: (r[c] as string) || (r[b] as string), admin1: (r[d] as string) || null, country: r[e] as string, lat: r[g] as number, lon: r[h] as number, pop_max: r[k] as number }))
}
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
/** Prefix matches first, then substring; larger places first within each. */
export function searchPlaces(all: Place[], q: string, n = 8): Place[] {
  const k = fold(q.trim())
  if (k.length < 2) return []
  const pre: Place[] = [], sub: Place[] = []
  for (const p of all) {
    const a = fold(p.name_ascii || p.name)
    if (a.startsWith(k)) pre.push(p)
    else if (a.includes(k)) sub.push(p)
  }
  const by = (a: Place, b: Place) => b.pop_max - a.pop_max
  return [...pre.sort(by), ...sub.sort(by)].slice(0, n)
}
export const placeLabel = (p: Place) => [p.name, p.admin1 && p.admin1 !== p.name ? p.admin1 : null, p.country].filter(Boolean).join(', ')

/** "ne:1159151407" or "12.34,-56.78" */
export function parsePlace(s: string | undefined, all: Place[] | null): { title: string; lat: number; lon: number } | null {
  if (!s) return null
  const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(s)
  if (m) {
    const lat = +m[1], lon = +m[2]
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
    return { title: fmtLatLon(lat, lon), lat, lon }
  }
  const id = /^ne:(\d+)$/.exec(s)?.[1]
  const p = id && all?.find((x) => String(x.ne_id) === id)
  return p ? { title: placeLabel(p), lat: p.lat, lon: p.lon } : null
}

