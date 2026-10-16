// Continent per Earth cell. Preferred source: the `continent` column of earth_features (Natural Earth admin-0 CONTINENT,
// contract v1.1.1: uint8 codes, labels in the manifest's `codes` map). If a grid has no such column, fall back to the continents known from the shipped portfolio's sites.
import type { GridManifest } from '../types/contract'

export type ContinentOf = (cellId: number) => string | null

export function gridContinentLookup(manifest: GridManifest, columns: Record<string, ArrayLike<number>>): ContinentOf | null {
  const arr = manifest.arrays.find((a) => a.name === 'continent')
  const col = columns.continent
  const ids = columns.cell_id
  if (!arr || !col || !ids) return null
  const cats = arr.codes ?? arr.categories
  const label = (code: number): string | null => {
    if (!Number.isFinite(code)) return null
    const c = Math.round(code)
    const v = Array.isArray(cats) ? cats[c] : cats?.[String(c)]
    return v ?? `Continent ${c}`
  }
  const idx = new Map<number, number>()
  for (let i = 0; i < ids.length; i++) idx.set(ids[i], i)
  return (cellId) => {
    const i = idx.get(cellId)
    if (i === undefined) return null
    const l = label(col[i])
    // Natural Earth tags open ocean as "Seven seas (open ocean)": not a field-trip continent
    return l && !/^seven seas/i.test(l) ? l : null
  }
}

export function continentResolver(grid: ContinentOf | null, known: Map<number, string>): ContinentOf {
  return grid ?? ((cid) => known.get(cid) ?? null)
}
