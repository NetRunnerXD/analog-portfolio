import { useEffect, useState } from 'react'

/** LAYOUT.md breakpoints: wide ≥1360, laptop 1024–1359, tablet 600–1023, phone <600. */
export type Bp = 'wide' | 'laptop' | 'tablet' | 'phone'
const bpOf = (w: number): Bp => (w >= 1360 ? 'wide' : w >= 1024 ? 'laptop' : w >= 600 ? 'tablet' : 'phone')

export function useBreakpoint(): Bp {
  const [bp, setBp] = useState<Bp>(() => bpOf(window.innerWidth))
  useEffect(() => {
    const on = () => setBp(bpOf(window.innerWidth))
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return bp
}
