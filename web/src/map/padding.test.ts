import { describe, expect, it } from 'vitest'
import { obscuredPadding, offsetCenter } from './padding'

const map = { top: 0, left: 0, right: 800, bottom: 600 }

describe('map padding keeps pins clear of overlays', () => {
  it('adds the legend height at the bottom and the drawer width at the right', () => {
    const pad = obscuredPadding(map, [
      { side: 'bottom', rect: { top: 400, bottom: 590, left: 12, right: 272 } }, // legend 190 px tall
      { side: 'right', rect: { top: 0, bottom: 600, left: 500, right: 800 } }, // tablet drawer
    ], [48, 48, 48, 48])
    expect(pad[2]).toBe(600 - 400 + 24)
    expect(pad[1]).toBe(300 + 24)
    expect(pad[0]).toBe(48)
  })
  it('ignores overlays that do not overlap the map and caps padding at 80% of an axis', () => {
    expect(obscuredPadding(map, [{ side: 'bottom', rect: { top: 700, bottom: 900, left: 0, right: 800 } }])).toEqual([48, 48, 48, 48])
    const pad = obscuredPadding(map, [{ side: 'bottom', rect: { top: 20, bottom: 600, left: 0, right: 800 } }]) // phone sheet nearly full
    expect(pad[0] + pad[2]).toBeCloseTo(480, 6)
  })
  it('offsets the fly-to centre into the free area', () => {
    // bottom 200 px obscured: the pin should sit 76 px above the map centre, so the centre moves south by 76 px × res
    const c = offsetCenter([10, 50], [48, 48, 200, 48], 0.1)
    expect(c[0]).toBeCloseTo(10, 9)
    expect(c[1]).toBeCloseTo(50 - 7.6, 9)
  })
})
