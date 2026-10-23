// Canvas colours come from design/tokens.json (resolved brand values), so the canvas and the CSS use identical stops.
import tokens from '../styles/tokens.json'

type Tok = { value: string }
const c = tokens.color as unknown as Record<string, Record<string, Tok>>
export const T = {
  bg: c.bg.canvas.value,
  landNoData: c.map.landNoData.value,
  hatch: c.map.filteredHatch.value,
  coastline: c.map.coastline.value,
  graticule: c.map.graticule.value,
  pinEarth: c.map.pinEarth.value,
  pinMoon: c.map.pinMoon.value,
  pinMars: c.map.pinMars.value,
  outline: c.map.pinOutline.value,
  halo: c.map.pinHalo.value,
  ink: c.map.pinInk.value,
  markerStroke: c.map.markerStroke.value,
  markerFill: c.map.markerFill.value,
  selectRing: c.map.selectRing.value,
}
export const HEAT_STOPS: string[] = Array.from({ length: 9 }, (_, i) => c.heat[String(i)].value)
