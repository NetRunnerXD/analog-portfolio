// View padding that keeps pins out from under map overlays (legend, phone bottom sheet, tablet drawer, banners).
// Overlays opt in with data-map-obscures="top|right|bottom|left"; only the part that actually overlaps the map counts.

export type Side = 'top' | 'right' | 'bottom' | 'left'
export interface Box { top: number; right: number; bottom: number; left: number }
/** OpenLayers padding order: [top, right, bottom, left] */
export type Padding = [number, number, number, number]

export function obscuredPadding(map: Box, overlays: { side: Side; rect: Box }[], base: Padding = [48, 48, 48, 48]): Padding {
  const pad: Padding = [...base]
  const w = map.right - map.left
  const h = map.bottom - map.top
  for (const { side, rect } of overlays) {
    const overlapsX = rect.right > map.left && rect.left < map.right
    const overlapsY = rect.bottom > map.top && rect.top < map.bottom
    if (!overlapsX || !overlapsY) continue
    if (side === 'bottom') pad[2] = Math.max(pad[2], map.bottom - rect.top + base[2] / 2)
    if (side === 'top') pad[0] = Math.max(pad[0], rect.bottom - map.top + base[0] / 2)
    if (side === 'right') pad[1] = Math.max(pad[1], map.right - rect.left + base[1] / 2)
    if (side === 'left') pad[3] = Math.max(pad[3], rect.right - map.left + base[3] / 2)
  }
  // never pad away more than 80% of either axis (tiny maps still show the pins)
  const sy = pad[0] + pad[2] > 0.8 * h ? (0.8 * h) / (pad[0] + pad[2]) : 1
  const sx = pad[1] + pad[3] > 0.8 * w ? (0.8 * w) / (pad[1] + pad[3]) : 1
  return [pad[0] * sy, pad[1] * sx, pad[2] * sy, pad[3] * sx]
}

/** Measure every [data-map-obscures] overlay inside `root` against the map element. */
export function measurePadding(mapEl: HTMLElement, root: ParentNode, base?: Padding): Padding {
  const m = mapEl.getBoundingClientRect()
  const overlays = [...root.querySelectorAll<HTMLElement>('[data-map-obscures]')]
    .filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
    .map((e) => ({ side: e.dataset.mapObscures as Side, rect: e.getBoundingClientRect() }))
  return obscuredPadding(m, overlays, base)
}

/** Centre to animate to so that `coord` lands in the middle of the unobscured area at resolution `res` (EPSG:4326 degrees/px). */
export function offsetCenter(coord: [number, number], pad: Padding, res: number): [number, number] {
  const dx = (pad[1] - pad[3]) / 2 // positive: free area is shifted left
  const dy = (pad[2] - pad[0]) / 2 // positive: free area is shifted up
  return [coord[0] + dx * res, coord[1] - dy * res]
}
