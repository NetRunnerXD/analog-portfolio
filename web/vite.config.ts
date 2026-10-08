import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Relative base so the static build works on GitHub Pages (/analog-portfolio/) and any mirror.
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
  test: { include: ['src/**/*.test.ts'] },
})
