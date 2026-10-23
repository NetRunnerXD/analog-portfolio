import { useMemo } from 'react'
import { makeValueFormatter, to100 } from '../lib/format'
import type { FactorText } from '../lib/factors'
import { FACTOR_UI } from '../copy'
import { CORE_FACTORS, type FactorId, type FactorsFile, type Target } from '../types/contract'

/** Spec §8.5 PairedFactorRow: Factor · Earth · {Moon | Mars} · Match, as a real table. Earth values come from the scorer. */
export default function PairedFactors({ target, factors, ft, factorScores, earthFeatures, caption, compact }: {
  target: Target
  factors: FactorsFile
  ft: FactorText
  factorScores: Partial<Record<FactorId, number | null>>
  earthFeatures: Record<string, number | null> | null
  caption: string
  compact?: boolean
}) {
  const fmt = useMemo(() => makeValueFormatter(factors), [factors])
  const featureOf = useMemo(() => Object.fromEntries(factors.factors.map((f) => [f.id, f.feature])), [factors])
  const body = target.body === 'moon' ? 'Moon' : 'Mars'
  const rows = CORE_FACTORS.filter((f) => factorScores[f] !== undefined && factorScores[f] !== null)
  return (
    <table className={`paired ${compact ? 'compact' : ''}`}>
      <caption className="t-label">{caption}</caption>
      {compact && <colgroup><col className="c-f" /><col /><col /><col className="c-m" /></colgroup>}
      <thead>
        <tr><th scope="col">Factor</th><th scope="col" className="num-col">Earth</th><th scope="col" className="num-col">{body}</th><th scope="col">Match</th></tr>
      </thead>
      <tbody>
        {rows.map((f) => {
          const s = factorScores[f] as number
          const ex = earthFeatures?.[featureOf[f]]
          return (
            <tr key={f}>
              <th scope="row" className="t-small">{ft.label(f)}</th>
              <td className="num t-small num-col">{earthFeatures ? fmt(f, ex) : '…'}</td>
              <td className="num t-small num-col">{fmt(f, target.features?.[f]?.value)}</td>
              <td className="pmatch">
                <span className="fbar" aria-hidden="true"><i className={`g-${FACTOR_UI[f].group}`} style={{ width: `${to100(s)}%` }} /></span>
                <span className="num t-small">{to100(s)}<span className="sr-only"> out of 100</span></span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
