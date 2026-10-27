import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeGrid } from '../data'
import type { GridManifest } from '../types/contract'
import { cellCentre, cellIndexAt, decodedGrid, PlanetGrids } from './planetGrid'

const DATA = resolve(__dirname, '../../public/data')
const load = (name: string) => {
  const m = JSON.parse(readFileSync(resolve(DATA, name), 'utf8')) as GridManifest
  const b = readFileSync(resolve(DATA, m.binary))
  return decodedGrid(m, decodeGrid(m, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)))
}
const G1 = { resolution_deg: 1, ncols: 360, nrows: 180, lon_centre_first: -179.5, lat_centre_first: 89.5, row_order: 'north-to-south' } as const
const G05 = { resolution_deg: 0.5, ncols: 720, nrows: 360, lon_centre_first: -179.75, lat_centre_first: 89.75, row_order: 'north-to-south' } as const

describe('grid indexing', () => {
  it('1° index = row·360 + col and round-trips through the cell centre', () => {
    expect(cellIndexAt(G1, 89.9, -179.9)).toBe(0)
    expect(cellIndexAt(G1, -89.9, 179.9)).toBe(180 * 360 - 1)
    expect(cellIndexAt(G1, 0.2, 0.2)).toBe(89 * 360 + 180)
    for (const i of [0, 12345, 64799]) { const c = cellCentre(G1, i); expect(cellIndexAt(G1, c.lat, c.lon)).toBe(i) }
    expect(cellIndexAt(G1, 10, 180)).toBe(cellIndexAt(G1, 10, -180)) // wraps
  })
  it('0.5° matches the Earth cell_id convention', () => {
    expect(cellIndexAt(G05, -77.75, 162.25)).toBe(335 * 720 + 684)
  })
})

describe('uint8 decoding with scale / add_offset / nodata', () => {
  it('raw × scale + add_offset, 255 = NaN', () => {
    const m = { layout: 'dense', grid: G1, binary: 'x', arrays: [{ name: 'ts_mean_k', factor: 'F1', dtype: 'uint8', byte_offset: 0, length: 3, scale: 0.5, add_offset: 40, nodata: 255, units: 'K' }] } as unknown as GridManifest
    const col = decodeGrid(m, Uint8Array.of(0, 10, 255).buffer).ts_mean_k
    expect([col[0], col[1]]).toEqual([40, 45])
    expect(Number.isNaN(col[2])).toBe(true)
  })
})

describe('shipped Moon / Mars grids (contract v1.2)', () => {
  const moonPolar = load('moon_grid.json')
  const moon1 = load('moon_grid_1deg.json')
  const mars = load('mars_grid.json')
  it('manifests: Moon polar 0.5° sparse + 1° dense companion, Mars 1° dense, all value columns uint8', () => {
    expect(moonPolar.manifest.layout).toBe('sparse')
    expect(moonPolar.manifest.grid.resolution_deg).toBe(0.5)
    expect(moonPolar.manifest.companions).toContain('moon_grid_1deg.json')
    expect(moon1.manifest.grid.resolution_deg).toBe(1)
    expect(mars.manifest.grid.resolution_deg).toBe(1)
    for (const g of [moonPolar, moon1, mars]) for (const a of g.manifest.arrays) if (a.name !== 'cell_id') expect(a.dtype).toBe('uint8')
  })
  it('the polar subset holds |lat| >= 60° only', () => {
    const ids = moonPolar.columns.cell_id
    for (let k = 0; k < ids.length; k += 997) expect(Math.abs(cellCentre(G05, ids[k]).lat)).toBeGreaterThanOrEqual(60)
  })
  it('lookups use the finest grid that holds the point, and values are physical', () => {
    const moon = new PlanetGrids([moon1, moonPolar])
    const sp = moon.sample('ts_mean_k', -89.4, 130)!
    expect(sp.resolution_deg).toBe(0.5)
    expect(sp.value).toBeGreaterThan(20)
    expect(sp.value).toBeLessThan(150) // south polar cold
    const eq = moon.sample('ts_mean_k', 0.5, 23.5)!
    expect(eq.resolution_deg).toBe(1)
    expect(eq.value).toBeGreaterThan(200) // equatorial mean > 200 K
    const m = new PlanetGrids([mars]).sample('ts_mean_k', 18.4, 77.5)! // Jezero
    expect(m.value).toBeGreaterThan(170)
    expect(m.value).toBeLessThan(260)
  })
})
