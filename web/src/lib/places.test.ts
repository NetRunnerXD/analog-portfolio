import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodePlaces, parsePlace, searchPlaces } from './places'

const all = decodePlaces(JSON.parse(readFileSync(resolve(__dirname, '../../public/geo/places.json'), 'utf8')))
describe('place search', () => {
  it('prefix matches rank first, biggest first, accent-insensitive', () => {
    expect(searchPlaces(all, 'reykja')[0].name).toMatch(/Reykjav/)
    expect(searchPlaces(all, 'sao paulo')[0].country).toBe('Brazil')
    expect(searchPlaces(all, 'a')).toEqual([])
  })
  it('parses ids and coordinates', () => {
    const p = searchPlaces(all, 'Kolkata')[0]
    expect(parsePlace(`ne:${p.ne_id}`, all)?.lat).toBe(p.lat)
    expect(parsePlace('-77.85,166.67', null)).toMatchObject({ lat: -77.85, lon: 166.67 })
    expect(parsePlace('95,0', null)).toBeNull()
  })
})
