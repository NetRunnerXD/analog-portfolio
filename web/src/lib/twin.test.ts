import { describe, expect, it } from 'vitest'
import { cellSizeKm, circleRing, metresPerPixel, MOON_R, resolutionFor, scaleBar, spForward, spInverse, spScale } from './twin'

describe('Moon south polar stereographic', () => {
  it('maps the pole to the origin and round-trips', () => {
    const [x, y] = spForward([0, -90])
    expect(Math.abs(x) + Math.abs(y)).toBeLessThan(1e-6)
    for (const p of [[-54.58, -82.26], [129.2, -89.45], [-180, -75], [10, -85.5]]) {
      const [lon, lat] = spInverse(spForward(p))
      expect(lat).toBeCloseTo(p[1], 9)
      expect(((lon - p[0] + 540) % 360) - 180).toBeCloseTo(0, 9)
    }
  })
  it('matches the Trek layer extents (85.5°S NAC mosaic ≈ ±136.5 km, 75°S hillshade ≈ ±457 km)', () => {
    expect(spForward([90, -85.5])[0] / 1000).toBeCloseTo(136.6, 0)
    expect(spForward([90, -75])[0] / 1000).toBeCloseTo(457.4, 0)
  })
  it('lon 0 points up (+y) and lon 90°E to the right (+x)', () => {
    expect(spForward([0, -80])[1]).toBeGreaterThan(0)
    expect(spForward([90, -80])[0]).toBeGreaterThan(0)
  })
  it('scale factor is 1 at the pole and grows away from it', () => {
    expect(spScale(-90)).toBe(1)
    expect(spScale(-80)).toBeGreaterThan(1)
  })
})

describe('same scale on both panes', () => {
  it('converts metres per pixel to each projection and back', () => {
    const mpp = 250
    const rE = resolutionFor('deg', mpp, 6371008.8, -77.5)
    expect(metresPerPixel('deg', rE, 6371008.8, -77.5)).toBeCloseTo(mpp, 9)
    const rM = resolutionFor('sp', mpp, MOON_R, -89.4)
    expect(metresPerPixel('sp', rM, MOON_R, -89.4)).toBeCloseTo(mpp, 9)
    // one degree of latitude spans about 111 km on Earth and 30 km on the Moon at the same metres per pixel
    expect(resolutionFor('deg', mpp, 6371008.8, 0) / resolutionFor('deg', mpp, MOON_R, 0)).toBeCloseTo(MOON_R / 6371008.8, 9)
  })
  it('scale bar picks 1/2/5 lengths that fit', () => {
    expect(scaleBar(200, 120)).toEqual({ px: 100, label: '20 km' })
    expect(scaleBar(3, 120).label).toBe('200 m')
    expect(scaleBar(1000, 120).label).toBe('100 km')
  })
  it('sample circle has the right radius and cell sizes follow latitude', () => {
    const ring = circleRing([-54.58, -82.26], 15000, MOON_R)
    const [cx, cy] = spForward([-54.58, -82.26])
    for (const p of ring) { const [x, y] = spForward(p); expect(Math.hypot(x - cx, y - cy) / spScale(-82.26)).toBeGreaterThan(14800); expect(Math.hypot(x - cx, y - cy) / spScale(-82.26)).toBeLessThan(15200) }
    expect(cellSizeKm(0, 6371008.8)).toEqual([56, 56])
    expect(cellSizeKm(60, 6371008.8)).toEqual([56, 28])
  })
})
