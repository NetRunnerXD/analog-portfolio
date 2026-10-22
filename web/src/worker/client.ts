import type { ScoringConstants } from '../scoring/engine'
// Main-thread wrapper around the scoring worker. One worker per app; requests resolve by reqId.
import type { FactorsFile, GridManifest, ProfilesFile } from '../types/contract'
import type { CellDetail, FromWorker, ScoreMsg, ScoredMsg, ToWorker } from './protocol'

type Pending = { resolve: (v: never) => void; reject: (e: Error) => void }

export class ScorerClient {
  private w: Worker
  private seq = 0
  private pending = new Map<number, Pending>()
  private readyP: Promise<number>
  onCrash?: (msg: string) => void

  constructor(init: { manifest: GridManifest; buffer: ArrayBuffer; factors: FactorsFile; profiles: ProfilesFile; knownCells: [number, string][]; constants?: ScoringConstants }) {
    this.w = new Worker(new URL('./scorer.worker.ts', import.meta.url), { type: 'module', name: 'scorer' })
    this.readyP = new Promise((resolve, reject) => {
      const onMsg = (ev: MessageEvent<FromWorker>) => {
        const m = ev.data
        if (m.type === 'ready') resolve(m.nCells)
        else if (m.type === 'error' && m.reqId === undefined) reject(new Error(m.message))
      }
      this.w.addEventListener('message', onMsg)
    })
    this.w.addEventListener('message', (ev: MessageEvent<FromWorker>) => {
      const m = ev.data
      if (m.type === 'ready') return
      if (m.type === 'error') {
        if (m.reqId !== undefined) { this.pending.get(m.reqId)?.reject(new Error(m.message)); this.pending.delete(m.reqId) }
        return
      }
      const p = this.pending.get(m.reqId)
      if (!p) return
      this.pending.delete(m.reqId)
      p.resolve((m.type === 'cell' ? m.detail : m) as never)
    })
    this.w.addEventListener('error', (e) => {
      const msg = e.message || 'worker crashed'
      for (const p of this.pending.values()) p.reject(new Error(msg))
      this.pending.clear()
      this.onCrash?.(msg)
    })
    const msg: ToWorker = { type: 'init', ...init }
    this.w.postMessage(msg, [init.buffer])
  }

  ready() { return this.readyP }

  private req<T>(m: ToWorker): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.set((m as { reqId: number }).reqId, { resolve: resolve as (v: never) => void, reject })
      this.w.postMessage(m)
    })
  }

  score(m: Omit<ScoreMsg, 'type' | 'reqId'>): Promise<ScoredMsg> {
    return this.req<ScoredMsg>({ type: 'score', reqId: ++this.seq, ...m })
  }

  cell(cellId: number): Promise<CellDetail> {
    return this.req<CellDetail>({ type: 'cell', reqId: ++this.seq, cellId })
  }

  terminate() { this.w.terminate() }
}
