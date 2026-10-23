import { coverageMatrix, type CoverCell } from '../lib/matrix'
import { siteTitle, to100 } from '../lib/format'
import type { FactorText } from '../lib/factors'
import type { FactorId, SiteRef } from '../types/contract'
import { AtLimitIcon } from './ui'

const SR: Record<CoverCell, string> = { covered: 'covered', atLimit: "covered at Earth's limit", partial: 'partly', none: 'not covered' }

/** Spec §8.4 CoverageMatrix: a real table, columns = the m needs only, ⤒ for covered at Earth's limit. */
export default function CoverageMatrix({ sites, needs, theta, atLimit, ft, phone }: {
  sites: SiteRef[]
  needs: FactorId[]
  theta: number
  atLimit: (f: FactorId) => boolean
  ft: FactorText
  phone: boolean
}) {
  if (!sites.length || !needs.length) return null
  const m = coverageMatrix(sites, needs, theta, atLimit)
  const unc = new Set(m.uncovered)
  const th = to100(theta)
  return (
    <div className="matrix">
      <p className="matrix-key t-small muted2" aria-hidden="true"><span className="mk-dot" /> ≥ {th} · <AtLimitIcon size={14} /> Earth's limit · <span className="mk-half" /> partly</p>
      {phone && <p className="t-small muted2">Scroll sideways to see all needs →</p>}
      <div className="matrix-scroll" role="region" aria-labelledby="matrix-cap" tabIndex={0}>
        <table>
          <caption id="matrix-cap" className="t-label">Who covers what</caption>
          <thead>
            <tr>
              <td />
              {needs.map((f) => (
                <th key={f} scope="col" className={unc.has(f) ? 'unc' : ''}>
                  <abbr title={ft.label(f)} className="micro">{ft.chip(f)}</abbr><span className="sr-only">, {ft.label(f)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sites.map((s, i) => (
              <tr key={s.site_id}>
                <th scope="row" className="t-small"><span className="pin-glyph sm num" aria-hidden="true">{i + 1}</span> <span className="sr-only">Site {i + 1}: </span>{siteTitle(s)}</th>
                {needs.map((f, j) => {
                  const c = m.cells[i][j]
                  const v = s.factor_scores[f]
                  return (
                    <td key={f} className={`mc ${c} ${unc.has(f) ? 'unc' : ''}`}>
                      {c === 'covered' && <span className="mk-dot" aria-hidden="true" />}
                      {c === 'atLimit' && <AtLimitIcon size={16} />}
                      {c === 'partial' && <span className="mk-half" aria-hidden="true" />}
                      <span className="sr-only">{c === 'partial' ? `partly, ${to100(v as number)}` : SR[c]}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          {m.uncovered.length > 0 && (
            <tfoot>
              <tr>
                <td />
                {needs.map((f) => <td key={f} className={`micro ${unc.has(f) ? 'unc-foot' : ''}`}>{unc.has(f) ? <><span aria-hidden="true">✕ {ft.chip(f)}</span><span className="sr-only">No site covers {ft.label(f)}</span></> : null}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {m.uncovered.length > 0 && <p className="t-small muted2">Not covered by these sites: {m.uncovered.map((f) => ft.label(f)).join(', ')}.</p>}
    </div>
  )
}
