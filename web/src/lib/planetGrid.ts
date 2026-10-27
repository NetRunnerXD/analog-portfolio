// Moon / Mars grids (contract v1.2): every column uint8 with per-column scale / add_offset (raw 255 = nodata), decoded by
// data.ts decodeGrid. Moon = moon_grid (sparse 0.5° polar subset |lat| >= 60°, with cell_id) + moon_grid_1deg (dense 1°
// global, index = row·360 + col); Mars = mars_grid (dense 1°). Lookups prefer the finest grid that holds the point.
import { decodeGrid, fetchGridRaw } from '../data'
import type { GridManifest, TargetBody } from '../types/contract'

type GridDef = GridManifest['grid']

/** Row / column / flat index of the cell holding (lat, lon) on a regular north-to-south grid. */
export function cellIndexAt(g: GridDef, lat: number, lon: number): number {
  const res = g.resolution_deg
  const north = g.lat_centre_first + res / 2
  const west = g.lon_centre_first - res / 2
  const row = Math.min(g.nrows - 1, Math.max(0, Math.floor((north - lat) / res)))
  const lonW = ((((lon - west) % 360) + 360) % 360)
  const col = Math.min(g.ncols - 1, Math.floor(lonW / res))
  return row * g.ncols + col
}
export function cellCentre(g: GridDef, index: number): { lat: number; lon: number } {
  const row = Math.floor(index / g.ncols)
  const col = index % g.ncols
  return { lat: g.lat_centre_first - g.resolution_deg * row, lon: g.lon_centre_first + g.resolution_deg * col }
}

export interface DecodedGrid {
  manifest: GridManifest
  columns: Record<string, Float64Array>
  /** flat cell index → position in the column arrays (sparse grids); dense grids use the index directly */
  pos: (index: number) => number | undefined
}

export function decodedGrid(manifest: GridManifest, columns: Record<string, Float64Array>): DecodedGrid {
  if (manifest.layout === 'dense') {
    const n = manifest.grid.ncols * manifest.grid.nrows
    return { manifest, columns, pos: (i) => (i >= 0 && i < n ? i : undefined) }
  }
  const ids = columns.cell_id
  if (!ids) throw new Error(`${manifest.binary}: a sparse grid needs a cell_id column`)
  const m = new Map<number, number>()
  for (let k = 0; k < ids.length; k++) m.set(ids[k], k)
  return { manifest, columns, pos: (i) => m.get(i) }
}

export interface PlanetSample { value: number; resolution_deg: number; cellIndex: number; lat: number; lon: number }

/** A body's grids, finest first. */
export class PlanetGrids {
  readonly grids: DecodedGrid[]
  constructor(grids: DecodedGrid[]) {
    this.grids = [...grids].sort((a, b) => a.manifest.grid.resolution_deg - b.manifest.grid.resolution_deg)
  }
  /** Value of a column at a point from the finest grid that holds the cell (and has the column). NaN = nodata;
   *  null = no grid covers it. */
  sample(column: string, lat: number, lon: number): PlanetSample | null {
    for (const g of this.grids) {
      const col = g.columns[column]
      if (!col) continue
      const idx = cellIndexAt(g.manifest.grid, lat, lon)
      const p = g.pos(idx)
      if (p === undefined) continue
      const c = cellCentre(g.manifest.grid, idx)
      return { value: col[p], resolution_deg: g.manifest.grid.resolution_deg, cellIndex: idx, ...c }
    }
    return null
  }
}

/** Allocation-free lookup of one column (finest grid first) for per-pixel rendering. NaN = nodata or uncovered. */
export function sampler(grids: PlanetGrids, column: string): (lat: number, lon: number) => number {
  const gs = grids.grids.filter((g) => g.columns[column])
  return (lat, lon) => {
    for (const g of gs) {
      const p = g.pos(cellIndexAt(g.manifest.grid, lat, lon))
      if (p !== undefined) return g.columns[column][p]
    }
    return NaN
  }
}
/** Finite min / max of a column across a body's grids. */
export function columnRange(grids: PlanetGrids, column: string): [number, number] {
  let lo = Infinity, hi = -Infinity
  for (const g of grids.grids) for (const v of g.columns[column] ?? []) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v }
  return [lo, hi]
}

const cache = new Map<TargetBody, Promise<PlanetGrids>>()
/** Fetch and decode {body}_grid.json and its companions once (lazy; nothing is bundled). */
export function loadPlanetGrids(body: TargetBody): Promise<PlanetGrids> {
  let p = cache.get(body)
  if (!p) {
    p = (async () => {
      const first = await fetchGridRaw(`${body}_grid.json`)
      const raws = [first, ...(await Promise.all((first.manifest.companions ?? []).map((c) => fetchGridRaw(c))))]
      return new PlanetGrids(raws.map(({ manifest, buffer }) => decodedGrid(manifest, decodeGrid(manifest, buffer))))
    })()
    p.catch(() => cache.delete(body))
    cache.set(body, p)
  }
  return p
}
