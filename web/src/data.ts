import type { FactorsFile, GapsFile, GridManifest, Portfolio, ProfilesFile, TargetsFile, ValidationFile } from './types/contract'

// Real assets live in data/; mock assets (contract-shaped, synthetic) in data/mock/.
export const DATA_ROOT: string = import.meta.env.VITE_DATA_ROOT ?? 'data/mock/'
export const dataUrl = (p: string) => `${import.meta.env.BASE_URL}${DATA_ROOT}${p}`

export class DataError extends Error {
  file: string
  status: number | null
  constructor(file: string, status: number | null, message?: string) {
    super(message ?? `${file}: ${status === null ? 'network error' : `HTTP ${status}`}`)
    this.file = file
    this.status = status
  }
}

async function getJson<T>(p: string): Promise<T> {
  let r: Response
  try { r = await fetch(dataUrl(p)) } catch { throw new DataError(p, null) }
  if (!r.ok) throw new DataError(p, r.status)
  return (await r.json()) as T
}

export const loadTargets = () => getJson<TargetsFile>('targets.json')
export const loadProfiles = () => getJson<ProfilesFile>('profiles.json')
export const loadFactors = () => getJson<FactorsFile>('factors.json')
export const loadGaps = () => getJson<GapsFile>('gaps.json')
export const loadValidation = () => getJson<ValidationFile>('validation.json')
export const loadPortfolio = (targetId: string, profileId: string) => getJson<Portfolio>(`portfolios/${targetId}_${profileId}.json`)

const CTORS = { uint8: Uint8Array, uint16: Uint16Array, uint32: Uint32Array, int16: Int16Array, float32: Float32Array }

/** Decode a grid binary into physical-unit Float64Arrays (NaN = nodata), exactly like read_grid() in Python. */
export function decodeGrid(manifest: GridManifest, buf: ArrayBuffer): Record<string, Float64Array> {
  const columns: Record<string, Float64Array> = {}
  for (const a of manifest.arrays) {
    const raw = new CTORS[a.dtype](buf, a.byte_offset, a.length)
    const out = new Float64Array(a.length)
    for (let i = 0; i < a.length; i++) {
      out[i] = a.name === 'cell_id' ? raw[i] : a.nodata !== null && raw[i] === a.nodata ? NaN : raw[i] * a.scale + a.add_offset
    }
    columns[a.name] = out
  }
  return columns
}

export async function fetchGridRaw(manifestName: string): Promise<{ manifest: GridManifest; buffer: ArrayBuffer }> {
  const manifest = await getJson<GridManifest>(manifestName)
  let r: Response
  try { r = await fetch(dataUrl(manifest.binary)) } catch { throw new DataError(manifest.binary, null) }
  if (!r.ok) throw new DataError(manifest.binary, r.status)
  return { manifest, buffer: await r.arrayBuffer() }
}

/** Decode a grid binary into physical-unit arrays (NaN = nodata). */
export async function loadGrid(manifestName: string): Promise<{ manifest: GridManifest; columns: Record<string, Float64Array> }> {
  const { manifest, buffer } = await fetchGridRaw(manifestName)
  return { manifest, columns: decodeGrid(manifest, buffer) }
}
