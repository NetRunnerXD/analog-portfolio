import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Content-Security-Policy for the static build. Injected as a <meta> tag at build time only,
// so `npm run dev` (which relies on inline <style>/HMR scripts) keeps working.
// External origins allowed: NASA GIBS WMTS tiles (reserved; the current basemap is self-hosted under public/basemap,
// fonts are bundled via @fontsource, so the app itself loads nothing cross-origin today).
// Keep in sync with web/public/_headers and web/vercel.json (those add frame-ancestors,
// which a <meta> CSP cannot set).
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' https://gibs.earthdata.nasa.gov",
  "connect-src 'self'",
  "font-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const cspMeta = (): Plugin => ({
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    { tag: 'meta', attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' }, injectTo: 'head-prepend' },
  ],
})

// Base path is env-driven: './' (relative) by default so the build works on any static host;
// GitHub Pages builds set VITE_BASE=/analog-portfolio/ (see docs/DEPLOY.md, scripts/preview.sh).
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  plugins: [react(), cspMeta()],
  server: { fs: { allow: ['..'] } },
  test: { include: ['src/**/*.test.ts'] },
})
