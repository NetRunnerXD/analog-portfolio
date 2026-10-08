import type { FactorsFile, GapsFile, GridManifest, Portfolio, ProfilesFile, TargetsFile } from './types/contract'

// Real assets live in data/; mock assets (contract-shaped, synthetic) in data/mock/.
export const DATA_ROOT: string = import.meta.env.VITE_DATA_ROOT ?? 'data/mock/'
const url = (p: string) => `${import.meta.env.BASE_URL}${DATA_ROOT}${p}`

async function getJson<T>(p: string): Promise<T> {
  const r = await fetch(url(p))
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`)
  return (await r.json()) as T
}

export const loadTargets = () => getJson<TargetsFile>('targets.json')
export const loadProfiles = () => getJson<ProfilesFile>('profiles.json')
export const loadFactors = () => getJson<FactorsFile>('factors.json')
export const loadGaps = () => getJson<GapsFile>('gaps.json')
export const loadPortfolio = (targetId: string, profileId: string) =>
  getJson<Portfolio>(`portfolios/${targetId}_${profileId}.json`)

const CTORS = { uint8: Uint8Array, uint16: Uint16Array, uint32: Uint32Array, int16: Int16Array, float32: Float32Array }

/** Decode a grid binary into physical-unit Float32Arrays (NaN = nodata). */
export async function loadGrid(manifestName: string): Promise<{ manifest: GridManifest; columns: Record<string, Float32Array> }> {
  const manifest = await getJson<GridManifest>(manifestName)
  const buf = await (await fetch(url(manifest.binary))).arrayBuffer()
  const columns: Record<string, Float32Array> = {}
  for (const a of manifest.arrays) {
    const raw = new CTORS[a.dtype](buf, a.byte_offset, a.length)
    const out = new Float32Array(a.length)
    for (let i = 0; i < a.length; i++) {
      out[i] = a.nodata !== null && raw[i] === a.nodata ? NaN : a.name === 'cell_id' ? raw[i] : raw[i] * a.scale + a.add_offset
    }
    columns[a.name] = out
  }
  return { manifest, columns }
}
