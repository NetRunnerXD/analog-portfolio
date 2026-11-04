import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CSP } from '../vite.config'
import { PYRAMIDS, TILE_SOURCES } from './lib/twin'

const root = resolve(__dirname, '..')
const headers = readFileSync(resolve(root, 'public/_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)![1].trim()
const vercel = (JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as { headers: { headers: { key: string; value: string }[] }[] })
  .headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')!.value

describe('CSP', () => {
  it('the three copies agree (headers add frame-ancestors, which a meta CSP cannot set)', () => {
    expect(headers).toBe(`${CSP}; frame-ancestors 'none'`)
    expect(vercel).toBe(headers)
  })
  it('img-src lists only the tile path prefixes, and every tile URL falls under one; no other directive has an https source', () => {
    const img = CSP.split('; ').find((d) => d.startsWith('img-src'))!.split(' ')
    expect(img.filter((x) => x.startsWith('https:'))).toEqual(TILE_SOURCES)
    for (const s of TILE_SOURCES) expect(s.endsWith('/'), `${s} needs a trailing slash to match as a prefix`).toBe(true)
    for (const p of Object.values(PYRAMIDS)) expect(TILE_SOURCES.some((s) => p.url.startsWith(s)), p.url).toBe(true)
    expect(CSP.split('; ').filter((d) => !d.startsWith('img-src')).join(' ')).not.toMatch(/https:/)
  })
})
