import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FACTOR_UI } from '../copy'
import { gridContinentLookup, continentResolver } from '../scoring/continent'
import { EARTH_RADIUS_KM, earthRadiusKm, haversineKm } from '../scoring/area'
import type { FactorsFile, GridManifest, ProfilesFile } from '../types/contract'
import { ALL_FACTORS } from '../types/contract'
import { makeFactorText } from './factors'
import { placeName, siteTitle } from './format'

const MOCK = resolve(__dirname, '../../public/data/mock')
const factors = JSON.parse(readFileSync(resolve(MOCK, 'factors.json'), 'utf8')) as FactorsFile
const profiles = JSON.parse(readFileSync(resolve(MOCK, 'profiles.json'), 'utf8')) as ProfilesFile

describe('factor labels come only from factors.json', () => {
  it('label/info read ui_label/ui_copy; the copy map carries no names', () => {
    const ft = makeFactorText(factors)
    for (const f of ALL_FACTORS) {
      const d = factors.factors.find((x) => x.id === f)!
      expect(ft.label(f)).toBe(d.ui_label!.replace(/\s*\(tie-?breaker\)\s*$/i, ''))
      expect(ft.info(f)).toBe(d.ui_copy)
      expect(ft.secondary(f)).toBe(d.tier === 'secondary')
      expect(Object.keys(FACTOR_UI[f]).sort()).toEqual(['chip', 'good', 'group', 'weak'])
    }
  })
  it('a relabelled factors.json changes the UI label with no code change', () => {
    const edited = { ...factors, factors: factors.factors.map((x) => (x.id === 'F1' ? { ...x, ui_label: 'Average ground temperature', ui_short: 'Tmp', ui_chip: 'Cold!' } : x)) }
    const ft = makeFactorText(edited)
    expect(ft.label('F1')).toBe('Average ground temperature')
    expect(ft.short('F1')).toBe('Tmp')
    expect(ft.chip('F1')).toBe('Cold!')
  })
})

describe('Earth radius', () => {
  it('is the IUGG mean radius from profiles.json', () => {
    expect(EARTH_RADIUS_KM).toBe(6371.0088)
    expect(earthRadiusKm(profiles.defaults)).toBe(6371.0088)
    expect(earthRadiusKm({ earth_radius_km: 6371.0 })).toBe(6371.0)
    expect(earthRadiusKm(undefined)).toBe(EARTH_RADIUS_KM)
    // one degree of latitude
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo((Math.PI / 180) * 6371.0088, 9)
  })
})

describe('continent column and place names (optional data)', () => {
  const manifest = { arrays: [{ name: 'cell_id' }, { name: 'continent', codes: { '0': 'Africa', '1': 'Antarctica', '2': 'Seven seas (open ocean)' } }] } as unknown as GridManifest
  it('uses the grid continent when present', () => {
    const look = gridContinentLookup(manifest, { cell_id: [10, 20, 30, 40], continent: [0, 1, 2, NaN] })!
    expect(look(10)).toBe('Africa')
    expect(look(20)).toBe('Antarctica')
    expect(look(30)).toBeNull()
    expect(look(40)).toBeNull()
    expect(continentResolver(look, new Map([[10, 'Europe']]))(10)).toBe('Africa')
  })
  it('falls back to the shipped-portfolio map when the column is absent', () => {
    const look = gridContinentLookup({ arrays: [{ name: 'cell_id' }] } as unknown as GridManifest, { cell_id: [10] })
    expect(look).toBeNull()
    expect(continentResolver(look, new Map([[10, 'Europe']]))(10)).toBe('Europe')
  })
  it('site titles become "Region, Country" when present', () => {
    const base = { site_id: 'cell_1', name: 'Candidate cell 1, 2', lat: 74.25, lon: -89.75, known_analog: null }
    expect(siteTitle(base)).toBe('Earth site at 74.3°N 89.8°W')
    expect(siteTitle({ ...base, region: 'Nunavut', country: 'Canada' })).toBe('Nunavut, Canada')
    expect(siteTitle({ ...base, admin1: 'Nunavut', country: 'Canada' })).toBe('Nunavut, Canada')
    expect(siteTitle({ ...base, country: 'Canada' })).toBe('Canada')
    expect(siteTitle({ ...base, known_analog: 'Devon Island (HMP)', region: 'Nunavut', country: 'Canada' })).toBe('Devon Island (HMP)')
    expect(placeName({ region: 'Nunavut', country: 'Canada' })).toBe('Nunavut, Canada')
  })
})
