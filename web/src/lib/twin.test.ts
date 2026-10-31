import { describe, expect, it } from 'vitest'
import { cellSizeKm, circleRing, destination, metresPerPixel, MOON_R, resolutionFor, scaleBar, spForward, spInverse, spScale } from './twin'

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

describe('oblique stereographic pane projection', () => {
  it('is the identity at the anchor, round-trips, and keeps true scale near the centre on both axes', async () => {
    const { obliqueStereo } = await import('./twin')
    for (const [lat0, lon0, R] of [[-77.5, 162.0, 6371008.8], [-82.26, -54.58, MOON_R], [18.4, 77.5, 3396190], [64, -179.9, 6371008.8]]) {
      const p = obliqueStereo(lat0, lon0, R)
      expect(p.forward([lon0, lat0]).map(Math.abs).every((v) => v < 1e-6)).toBe(true)
      for (const q of [[lon0 + 0.3, lat0 - 0.2], [lon0 - 1, lat0 + 0.5]]) {
        const [lon, lat] = p.inverse(p.forward(q))
        expect(lat).toBeCloseTo(q[1], 9)
        expect(((lon - q[0] + 540) % 360) - 180).toBeCloseTo(0, 9)
      }
      // 1 km north and 1 km east of the anchor land ~1000 m up and right
      const d = 1000
      const n = p.forward(destination([lon0, lat0], d, 0, R))
      const e = p.forward(destination([lon0, lat0], d, 90, R))
      expect(n[0]).toBeCloseTo(0, 3); expect(n[1]).toBeCloseTo(d, 1)
      expect(e[0]).toBeCloseTo(d, 1); expect(Math.abs(e[1])).toBeLessThan(0.1)
    }
  })
  it('imagery: south-polar Moon mosaics below 60°S, one origin per service', async () => {
    const { panePyramids, tileOrigins } = await import('./twin')
    expect(panePyramids('moon', -89.4).map((p) => p.kind)).toEqual(['sp', 'sp'])
    expect(panePyramids('moon', 10)[0].kind).toBe('deg')
    expect(tileOrigins.sort()).toEqual(['https://gibs.earthdata.nasa.gov', 'https://trek.nasa.gov'])
  })
})
