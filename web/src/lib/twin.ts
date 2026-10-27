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

/**
 * Oblique stereographic projection on a sphere (Snyder 1987, eqs. 21-2…21-4, 20-14…20-16), centred on an anchor.
 * Every twin pane is drawn in one of these, centred on its own site: north is up, scale is true at the centre and both
 * axes share it, so equal map resolution means equal metres per pixel on Earth, the Moon and Mars. Tiles are reprojected
 * from their native grids (geographic or Moon south polar) by OpenLayers.
 */
export function obliqueStereo(lat0: number, lon0: number, R: number) {
  const φ0 = lat0 * D2R, λ0 = lon0 * D2R
  const s0 = Math.sin(φ0), c0 = Math.cos(φ0)
  const forward = ([lon, lat]: number[]): [number, number] => {
    const φ = lat * D2R, dλ = lon * D2R - λ0
    const cosc = s0 * Math.sin(φ) + c0 * Math.cos(φ) * Math.cos(dλ)
    const k = 2 / Math.max(1 + cosc, 1e-12)
    return [R * k * Math.cos(φ) * Math.sin(dλ), R * k * (c0 * Math.sin(φ) - s0 * Math.cos(φ) * Math.cos(dλ))]
  }
  const inverse = ([x, y]: number[]): [number, number] => {
    const ρ = Math.hypot(x, y)
    if (ρ < 1e-9) return [lon0, lat0]
    const c = 2 * Math.atan(ρ / (2 * R))
    const sc = Math.sin(c), cc = Math.cos(c)
    const φ = Math.asin(Math.max(-1, Math.min(1, cc * s0 + (y * sc * c0) / ρ)))
    const λ = λ0 + Math.atan2(x * sc, ρ * c0 * cc - y * s0 * sc)
    return [((((λ / D2R) + 180) % 360) + 360) % 360 - 180, φ / D2R]
  }
  return { forward, inverse }
}

/** Initial metres per pixel so the larger of the two footprints (diameter, m) fills ~70% of the narrower pane. */
export const initialMpp = (footprintM: number, panePx: number) => footprintM / (0.7 * Math.max(panePx, 120))

/** Tile pyramids of the twin-viewer imagery, from each service's WMTS capabilities (checked Oct 12, 2026). */
export interface TilePyramid { url: string; tileSize: number; origin: [number, number]; res0: number; maxZ: number; kind: 'deg' | 'sp'; extent: [number, number, number, number]; credit: string }
const TREK = 'https://trek.nasa.gov/tiles'
const SP_HALF = 1095930
export const PYRAMIDS = {
  /** GIBS EPSG:4326 "best", Blue Marble Next Generation (true colour, 500 m); 512 px tiles, z0 = 2 × 1 */
  earth: { url: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_NextGeneration/default/500m/{z}/{y}/{x}.jpeg', tileSize: 512, origin: [-180, 90], res0: 0.5625, maxZ: 7, kind: 'deg', extent: [-180, -90, 180, 90], credit: 'NASA GIBS · true colour' },
  /** Moon Trek LRO WAC global mosaic (303 ppd), equirectangular, 256 px tiles, z0 = 2 × 1 */
  moonEq: { url: `${TREK}/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`, tileSize: 256, origin: [-180, 90], res0: 180 / 256, maxZ: 8, kind: 'deg', extent: [-180, -90, 180, 90], credit: 'NASA Moon Trek · LRO WAC' },
  /** Moon Trek south polar stereographic (IAU2000:30120): LRO WAC mosaic to 60°S (100 m) */
  moonSpWac: { url: `${TREK}/Moon/SP/LRO_WAC_Mosaic_SPole60_100m_v02/1.0.0/default/default028mm/{z}/{y}/{x}.png`, tileSize: 256, origin: [-SP_HALF, SP_HALF], res0: 8561.953125, maxZ: 5, kind: 'sp', extent: [-SP_HALF, -SP_HALF, SP_HALF, SP_HALF], credit: 'NASA Moon Trek · LRO WAC' },
  /** … and LOLA hillshade to 75°S (30 m) */
  moonSpLola: { url: `${TREK}/Moon/SP/LRO_LOLA_Shade_SPole75_30mp_v04/1.0.0/default/default028mm/{z}/{y}/{x}.png`, tileSize: 256, origin: [-SP_HALF, SP_HALF], res0: 8561.953125, maxZ: 6, kind: 'sp', extent: [-457440, -457440, 457440, 457440], credit: 'NASA Moon Trek · LOLA' },
  /** Mars Trek MGS MOLA colour hillshade (463 m), equirectangular */
  mars: { url: `${TREK}/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`, tileSize: 256, origin: [-180, 90], res0: 180 / 256, maxZ: 7, kind: 'deg', extent: [-180, -90, 180, 90], credit: 'NASA Mars Trek · MOLA hillshade' },
} satisfies Record<string, TilePyramid>

/** Imagery stack for a pane: Moon targets at or south of 60°S use the south-polar mosaics (no polar smear). */
export function panePyramids(body: 'earth' | 'moon' | 'mars', lat: number): TilePyramid[] {
  if (body === 'earth') return [PYRAMIDS.earth]
  if (body === 'mars') return [PYRAMIDS.mars]
  return lat <= -60 ? [PYRAMIDS.moonSpWac, PYRAMIDS.moonSpLola] : [PYRAMIDS.moonEq]
}
export const tileOrigins = [...new Set(Object.values(PYRAMIDS).map((p) => new URL(p.url.replace(/\{[xyz]\}/g, '0')).origin))]
