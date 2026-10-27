import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CSP } from '../vite.config'
import { tileOrigins } from './lib/twin'

const root = resolve(__dirname, '..')
const headers = readFileSync(resolve(root, 'public/_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)![1].trim()
const vercel = (JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as { headers: { headers: { key: string; value: string }[] }[] })
  .headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')!.value

describe('CSP', () => {
  it('the three copies agree (headers add frame-ancestors, which a meta CSP cannot set)', () => {
    expect(headers).toBe(`${CSP}; frame-ancestors 'none'`)
    expect(vercel).toBe(headers)
  })
  it('every imagery tile origin is allowed in img-src, and nowhere else', () => {
    const img = CSP.split('; ').find((d) => d.startsWith('img-src'))!.split(' ')
    for (const o of tileOrigins) expect(img).toContain(o)
    expect(CSP.split('; ').filter((d) => !d.startsWith('img-src')).join(' ')).not.toMatch(/https:/)
  })
})
