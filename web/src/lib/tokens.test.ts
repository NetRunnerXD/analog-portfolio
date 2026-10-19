import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Designer ruling (Oct 8): warnings are neutral text + a warning icon; gap magenta is only for Fidelity Gap content.
const css = ['../styles/brand.css', '../styles/tokens.css', '../index.css'].map((p) => readFileSync(resolve(__dirname, p), 'utf8')).join('\n')

describe('warning never maps to the gap magenta', () => {
  it('no warning token or warning rule references --ap-gap / gap colours / #F171E8', () => {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const GAP = /var\(--ap-gap\)|--ap-color-gap|--color-gap|#F171E8|--ap-light-gap-ink/i
    // custom properties named *warning*
    const props = [...clean.matchAll(/(--[\w-]*warning[\w-]*)\s*:\s*([^;]+)/gi)].filter((m) => GAP.test(m[2])).map((m) => m[0])
    // rule blocks whose selector mentions warning
    const rules = [...clean.matchAll(/([^{}]*warning[^{}]*)\{([^}]*)\}/gi)].filter((m) => GAP.test(m[2])).map((m) => m[1].trim())
    const offenders = [...props, ...rules]
    expect(offenders).toEqual([])
  })
})
