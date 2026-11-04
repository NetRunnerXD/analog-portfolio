import type { ValidationFile } from '../types/contract'

export interface BodyMetrics { blind: boolean; n_evaluations: number; n_scored: number; pct_top5: number; pct_top1: number; rank_auc: number | null; note?: string }
export interface ValidationHeadline { caveat: string | null; byBody: { body: 'moon' | 'mars'; m: BodyMetrics }[] }

/** summary.by_body + summary.headline_caveat (contract v1.2, pipeline 99f14cd). Blind bodies first, so the Moon leads. */
export function validationHeadline(v: ValidationFile): ValidationHeadline {
  const s = v.summary as { by_body?: Partial<Record<'moon' | 'mars', BodyMetrics>>; headline_caveat?: string }
  const byBody = (['moon', 'mars'] as const).flatMap((body) => (s.by_body?.[body] ? [{ body, m: s.by_body[body]! }] : []))
  byBody.sort((a, b) => Number(b.m.blind) - Number(a.m.blind))
  return { caveat: s.headline_caveat ?? null, byBody }
}
export const pctText = (x: number) => `${(x * 100).toFixed(1)}%`
export const blindText = (body: 'moon' | 'mars', blind: boolean) =>
  blind ? `${body === 'moon' ? 'Moon' : 'Mars'}: blind (the engine never saw these results)`
    : `${body === 'moon' ? 'Moon' : 'Mars'}: not blind (the dryness gate was designed using these ${body === 'moon' ? 'Moon' : 'Mars'} analogs and controls)`
