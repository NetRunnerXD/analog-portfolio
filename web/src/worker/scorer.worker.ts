/// <reference lib="webworker" />
// Live scoring worker: decodes the Earth grid once, then re-scores every land cell for the active target, purpose and
// weights with the TS port of the reference engine (src/scoring/engine.ts). Nothing here is hard-coded data.
import { decodeGrid } from '../data'
import { clipTargets, factorScores, NCELLS, prepareEarth, run, type EarthGrid, type RunOutput } from '../scoring/engine'
import type { FactorId, FactorsFile, ProfilesFile } from '../types/contract'
import type { CellDetail, FromWorker, ToWorker } from './protocol'

let earth: EarthGrid | null = null
let factors: FactorsFile | null = null
let profiles: ProfilesFile | null = null
let knownCells = new Map<number, string>()
let idxOf = new Map<number, number>()
const sCache = new Map<string, ReturnType<typeof factorScores>>()
let last: { out: RunOutput; s: ReturnType<typeof factorScores> } | null = null

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer)

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data
  try {
    if (m.type === 'init') {
      earth = prepareEarth(decodeGrid(m.manifest, m.buffer))
      factors = m.factors
      profiles = m.profiles
      knownCells = new Map(m.knownCells)
      idxOf = new Map()
      earth.cellId.forEach((c, i) => idxOf.set(c, i))
      sCache.clear()
      post({ type: 'ready', nCells: earth.n })
      return
    }
    if (!earth || !factors || !profiles) throw new Error('worker not initialised')
    if (m.type === 'score') {
      const t0 = performance.now()
      const profile = profiles.profiles.find((p) => p.id === m.profileId)
      if (!profile) throw new Error(`unknown profile ${m.profileId}`)
      const key = `${m.target.id}|${JSON.stringify(m.target.values)}`
      let s = sCache.get(key)
      if (!s) { s = factorScores(earth, m.target.values, m.target.body, factors); sCache.set(key, s) }
      const cont = new Map(m.continents)
      const out = run({
        earth, s, clips: clipTargets(earth, m.target.values, factors), targetId: m.target.id, profile, profiles, weights: m.weights,
        knownCells, continentOf: (cid) => cont.get(cid) ?? null,
      })
      last = { out, s }
      const heat = new Uint8Array(NCELLS).fill(255)
      const filter = new Uint8Array(NCELLS)
      let best = 0
      for (let i = 0; i < earth.n; i++) {
        const c = earth.cellId[i]
        heat[c] = Math.round(out.total[i] * 100)
        filter[c] = out.code[i]
        if (out.total[i] > best) best = out.total[i]
      }
      const th = out.portfolio.earth_thresholds!
      post({
        type: 'scored', reqId: m.reqId, heat, filter, portfolio: m.withPortfolio ? out.portfolio : null,
        stats: { nCells: earth.n, nPass: out.nPass, best, median: th.median, top5: th.top5, top1: th.top1, unknownFilters: out.unknownFilters, ms: performance.now() - t0 },
      }, [heat.buffer, filter.buffer])
      return
    }
    if (m.type === 'cell') {
      const i = idxOf.get(m.cellId)
      const row = Math.floor(m.cellId / 720)
      const detail: CellDetail = {
        cellId: m.cellId, inGrid: i !== undefined, lat: 89.75 - 0.5 * row, lon: -179.75 + 0.5 * (m.cellId % 720),
        score: null, percentile: null, filterCode: 0, factorScores: {}, features: {},
      }
      if (i !== undefined) {
        for (const [k, v] of Object.entries(earth.cols)) detail.features[k] = Number.isNaN(v[i]) ? null : v[i]
        if (last) {
          detail.score = last.out.total[i]
          detail.percentile = last.out.pct[i]
          detail.filterCode = last.out.code[i]
          for (const [f, arr] of Object.entries(last.s)) if (arr) detail.factorScores[f as FactorId] = arr[i]
        }
      }
      post({ type: 'cell', reqId: m.reqId, detail })
    }
  } catch (e) {
    post({ type: 'error', reqId: 'reqId' in m ? m.reqId : undefined, message: e instanceof Error ? e.message : String(e) })
  }
}
