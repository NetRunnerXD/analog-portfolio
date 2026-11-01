import { describe, expect, it } from 'vitest'
import { viewLut } from './heat'

const N = 720 * 360
const cell = (lat: number, lon: number) => Math.floor((90 - lat) * 2) * 720 + Math.floor((lon + 180) * 2)

describe('"In this view" heat colouring', () => {
  it('ranks the scores of the unfiltered land cells in view (mid-rank, area-weighted)', () => {
    const scores = new Uint8Array(N).fill(255)
    const filter = new Uint8Array(N)
    scores[cell(0.1, 10.1)] = 20
    scores[cell(0.1, 10.6)] = 40
    scores[cell(0.6, 11.1)] = 60
    scores[cell(0.6, 11.6)] = 80
    scores[cell(0.1, 12.1)] = 99; filter[cell(0.1, 12.1)] = 2 // filtered: not ranked
    scores[cell(40, 100)] = 100 // outside the view
    const lut = viewLut(scores, filter, [9, -1, 13, 2])!
    // four nearly equal-area cells: mid-ranks 12.5, 37.5, 62.5, 87.5
    expect(lut[20]).toBeLessThan(lut[40]); expect(lut[40]).toBeLessThan(lut[60]); expect(lut[60]).toBeLessThan(lut[80])
    expect(lut[10]).toBe(0)
    expect(lut[100]).toBe(100)
    expect(Math.abs(lut[20] - 12.5)).toBeLessThanOrEqual(1)
    expect(Math.abs(lut[80] - 87.5)).toBeLessThanOrEqual(1)
  })
  it('handles views past the antimeridian and empty views', () => {
    const scores = new Uint8Array(N).fill(255)
    const filter = new Uint8Array(N)
    scores[cell(0.1, -179.9)] = 30
    expect(viewLut(scores, filter, [170, -1, 190, 1])![30]).toBe(50)
    expect(viewLut(scores, filter, [0, -1, 10, 1])).toBeNull()
  })
})
