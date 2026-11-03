import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Content-Security-Policy for the static build. Injected as a <meta> tag at build time only,
// so `npm run dev` (which relies on inline <style>/HMR scripts) keeps working.
// External origins allowed (img-src only): NASA GIBS WMTS and NASA Solar System Treks tiles, used by the lazily loaded
// twin viewer and story mode (src/lib/twin.ts PYRAMIDS), narrowed to the tile path prefixes (CSP Level 2+ path-level
// sources; a trailing slash matches the prefix; Chrome, Firefox and Safari honour it in headers and <meta>; after a
// redirect only the origin is checked; neither service redirects these tile URLs, checked Oct 13, 2026). Everything else (data, basemap, fonts) is same-origin.
// Keep in sync with web/public/_headers and web/vercel.json (those add frame-ancestors,
// which a <meta> CSP cannot set).
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/ https://trek.nasa.gov/tiles/",
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
  build: {
    // Keep every chunk under Vite's 500 kB warning limit by splitting stable vendor code out of the app chunks
    // (the Explore screen is already a lazy route). OpenLayers loads only with the map; React is shared.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-ol', test: /node_modules[\\/](ol|rbush|quickselect|earcut|color-.*|pbf)[\\/]/ },
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  server: { fs: { allow: ['..'] } },
  test: { include: ['src/**/*.test.ts'] },
})
