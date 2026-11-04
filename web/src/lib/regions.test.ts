import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GridManifest, Portfolio } from '../types/contract'
import { decodeRegions, type RegionsManifest } from './regions'

const PUB = resolve(__dirname, '../../public')
const ef = JSON.parse(readFileSync(resolve(PUB, 'data/earth_features.json'), 'utf8')) as GridManifest
const efBin = readFileSync(resolve(PUB, 'data', ef.binary))
const a = ef.arrays.find((x) => x.name === 'cell_id')!
const ids = new Uint32Array(efBin.buffer.slice(efBin.byteOffset + a.byte_offset, efBin.byteOffset + a.byte_offset + 4 * a.length))
const m = JSON.parse(readFileSync(resolve(PUB, 'geo/cell_regions.json'), 'utf8')) as RegionsManifest
const b = readFileSync(resolve(PUB, 'geo', m.binary))
const reg = decodeRegions(m, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), ids)!

describe('cell → country / admin-1 index', () => {
  it('is aligned with the shipped Earth grid and names every land cell with a country', () => {
    expect(reg).not.toBeNull()
    let named = 0
    for (let i = 0; i < ids.length; i++) if (reg.country(i)) named++
    expect(named).toBe(ids.length)
  })
  it('matches the pipeline names of every exported site', () => {
    const idx = new Map<number, number>()
    ids.forEach((c, i) => idx.set(c, i))
    let n = 0
    for (const f of readdirSync(resolve(PUB, 'data/portfolios'))) {
      const p = JSON.parse(readFileSync(resolve(PUB, 'data/portfolios', f), 'utf8')) as Portfolio
      for (const s of [...(p.top_cells ?? []), ...p.variants.flatMap((v) => v.sites)]) {
        if (s.known_analog) continue // named at the analog's own coordinates, not the cell centre
        const i = idx.get(s.cell_id)!
        expect(reg.country(i), `${s.site_id} country`).toBe(s.country ?? null)
        expect(reg.admin1(i), `${s.site_id} admin1`).toBe(s.admin1 ?? null)
        n++
      }
    }
    expect(n).toBeGreaterThan(500)
  })
  it('refuses an index built for another grid', () => {
    expect(decodeRegions({ ...m, n_cells: 5 }, new ArrayBuffer(20), [1, 2, 3, 4, 5])).toBeNull()
  })
})
