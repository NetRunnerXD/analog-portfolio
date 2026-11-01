// Country + admin-1 region for any Earth land cell (web/public/geo/cell_regions.*, built by web/scripts/build_cell_regions.py
// with the pipeline's own naming rules), so sites from a live re-score get "Region, Country" titles like exported ones.
// Fetched only when the browser builds a portfolio itself (custom weights or a missing export).
export interface RegionsManifest { n_cells: number; first_cell_id: number; last_cell_id: number; binary: string; countries: string[]; admin1: string[] }
export interface Regions { country(i: number): string | null; admin1(i: number): string | null }

/** i = position in earth_features cell order. Returns null when the index was built for a different grid. */
export function decodeRegions(m: RegionsManifest, buf: ArrayBuffer, cellIds: ArrayLike<number>): Regions | null {
  const n = m.n_cells
  if (cellIds.length !== n || cellIds[0] !== m.first_cell_id || cellIds[n - 1] !== m.last_cell_id || buf.byteLength < 4 * n) return null
  const c = new Uint16Array(buf, 0, n)
  const a = new Uint16Array(buf, 2 * n, n)
  return {
    country: (i) => (c[i] ? m.countries[c[i] - 1] ?? null : null),
    admin1: (i) => (a[i] ? m.admin1[a[i] - 1] ?? null : null),
  }
}

export async function fetchRegions(base: string, cellIds: ArrayLike<number>): Promise<Regions | null> {
  const r = await fetch(`${base}geo/cell_regions.json`)
  if (!r.ok) return null
  const m = (await r.json()) as RegionsManifest
  const b = await fetch(`${base}geo/${m.binary}`)
  if (!b.ok) return null
  return decodeRegions(m, await b.arrayBuffer(), cellIds)
}
