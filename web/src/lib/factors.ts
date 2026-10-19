// Factor text comes from factors.json only (spec §7: "Components read them from there and never hard-code factor names").
import { FACTOR_UI } from '../copy'
import type { Factor, FactorId, FactorsFile } from '../types/contract'

export interface FactorText {
  /** factors.json ui_label (falls back to the data's own `name`), without a trailing "(tie-breaker)": the UI adds that from `tier` */
  label: (f: FactorId) => string
  /** factors.json ui_short (matrix column) when present, else the label */
  short: (f: FactorId) => string
  /** chip word: factors.json ui_chip when present, else the spec §7 everyday word */
  chip: (f: FactorId) => string
  /** factors.json ui_copy (info popover) */
  info: (f: FactorId) => string
  /** tier === 'secondary' (F11–F13 tie-breakers) */
  secondary: (f: FactorId) => boolean
}

const TIE = /\s*\(tie-?breaker\)\s*$/i

export function makeFactorText(file: FactorsFile): FactorText {
  const by = new Map<FactorId, Factor>(file.factors.map((x) => [x.id, x]))
  const label = (f: FactorId) => {
    const x = by.get(f)
    return (x?.ui_label ?? x?.name ?? f).replace(TIE, '')
  }
  return {
    label,
    short: (f) => by.get(f)?.ui_short ?? label(f),
    chip: (f) => by.get(f)?.ui_chip ?? FACTOR_UI[f].chip,
    info: (f) => by.get(f)?.ui_copy ?? '',
    secondary: (f) => by.get(f)?.tier === 'secondary',
  }
}
