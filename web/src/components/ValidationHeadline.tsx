import type { ValidationFile } from '../types/contract'
import { blindText, pctText, validationHeadline } from '../lib/validationSummary'

/** Moon (blind) first, then Mars (post hoc), each with its own metrics from summary.by_body, plus the headline caveat. */
export default function ValidationHeadline({ validation, compact }: { validation: ValidationFile; compact?: boolean }) {
  const h = validationHeadline(validation)
  if (!h.byBody.length) return null
  return (
    <div className="vheadline">
      {h.byBody.map(({ body, m }) => (
        <p key={body} className="t-small">
          <strong>{blindText(body, m.blind)}.</strong> {pctText(m.pct_top5)} of {m.n_evaluations} known-analog checks in the top 5%, {pctText(m.pct_top1)} in the top 1%{m.rank_auc !== null ? `, AUC ${m.rank_auc.toFixed(2)}` : ''}.
        </p>
      ))}
      {h.caveat && !compact && <p className="t-small muted2">{h.caveat}</p>}
    </div>
  )
}
