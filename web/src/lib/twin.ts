// Pure geometry for the twin viewer (spec §8.5 TwinViewer): equal metres per pixel on Earth, Moon and Mars,
// the Moon south-polar stereographic transform, footprints and the scale bar. No OpenLayers here so it is unit-testable.

/** Sphere radii (m) of the map projections the tiles are drawn in: Earth from profiles.json (passed in),
 *  Moon IAU2000:30100/30120 and Mars IAU2000:49900 (NASA Trek WMTS capabilities). Map constants, not engine values. */
export const MOON_R = 1737400
export const MARS_R = 3396190
const D2R = Math.PI / 180

/** Moon south polar stereographic (IAU2000:30120, lat_0 = −90°, lon_0 = 0°, k0 = 1, sphere). [lon, lat] → [x, y] m. */
export function spForward([lon, lat]: number[], R = MOON_R): [number, number] {
  const rho = 2 * R * Math.tan(Math.PI / 4 + (lat * D2R) / 2)
  return [rho * Math.sin(lon * D2R), rho * Math.cos(lon * D2R)]
}
export function spInverse([x, y]: number[], R = MOON_R): [number, number] {
  const rho = Math.hypot(x, y)
  const lat = (2 * Math.atan(rho / (2 * R)) - Math.PI / 2) / D2R
  const lon = rho === 0 ? 0 : Math.atan2(x, y) / D2R
  return [lon, lat]
}
/** Point scale factor of the polar stereographic projection at latitude φ (1 at the pole). */
export const spScale = (lat: number) => 2 / (1 + Math.abs(Math.sin(lat * D2R)))

/** View rotation (radians, OpenLayers convention) that puts local north up at a south-polar point. */
export const spNorthUpRotation = (lon: number) => Math.PI - lon * D2R

export type PaneKind = 'deg' | 'sp'
/** Map units per pixel → true metres per pixel at a latitude (N–S scale for degree maps). */
export function metresPerPixel(kind: PaneKind, res: number, R: number, lat: number): number {
  return kind === 'deg' ? res * D2R * R : res / spScale(lat)
}
export function resolutionFor(kind: PaneKind, mpp: number, R: number, lat: number): number {
  return kind === 'deg' ? mpp / (D2R * R) : mpp * spScale(lat)
}

/** Scale bar: the largest 1/2/5 × 10ⁿ length that fits in maxPx. */
export function scaleBar(mpp: number, maxPx = 120): { px: number; label: string } {
  const maxM = mpp * maxPx
  const p = Math.pow(10, Math.floor(Math.log10(maxM)))
  const m = [5, 2, 1].map((k) => k * p).find((v) => v <= maxM) ?? p
  return { px: m / mpp, label: m >= 1000 ? `${+(m / 1000).toPrecision(3)} km` : `${Math.round(m)} m` }
}

/** Point at a great-circle distance d (m) and bearing θ from [lon, lat] on a sphere of radius R. */
export function destination([lon, lat]: number[], d: number, bearingDeg: number, R: number): [number, number] {
  const φ1 = lat * D2R, λ1 = lon * D2R, δ = d / R, θ = bearingDeg * D2R
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
  return [((λ2 / D2R + 540) % 360) - 180, φ2 / D2R]
}
/** Sampling-window circle as a lon/lat ring. */
export const circleRing = (c: number[], radiusM: number, R: number, n = 72) =>
  Array.from({ length: n + 1 }, (_, i) => destination(c, radiusM, (360 * i) / n, R))

/** The scored 0.5° Earth cell around a cell centre, as a lon/lat ring. */
export function cellRing(lat: number, lon: number, half = 0.25): number[][] {
  return [[lon - half, lat - half], [lon + half, lat - half], [lon + half, lat + half], [lon - half, lat + half], [lon - half, lat - half]]
}
/** N–S × E–W size of a 0.5° cell in km on a sphere of radius R (m). */
export function cellSizeKm(lat: number, R: number): [number, number] {
  const ns = 0.5 * D2R * R / 1000
  return [Math.round(ns), Math.round(ns * Math.cos(lat * D2R))]
}
