const COLORS = ['#ff4f8b', '#ffd23f', '#2de2e6', '#9b7bff', '#3ee08f']

function reduced(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Confetti burst; the library is fetched on first use so it stays out of the initial bundle. */
export function burst(intensity: 'small' | 'big' = 'small') {
  if (reduced()) return
  void import('canvas-confetti')
    .then(({ default: confetti }) => {
      const big = intensity === 'big'
      const base = { colors: COLORS, disableForReducedMotion: true, zIndex: 70 }
      void confetti({
        ...base,
        particleCount: big ? 140 : 50,
        spread: big ? 100 : 70,
        startVelocity: big ? 48 : 36,
        origin: { y: big ? 0.6 : 0.75 },
        scalar: big ? 1.1 : 0.9,
      })
      if (big) {
        void confetti({ ...base, particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } })
        void confetti({ ...base, particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } })
      }
    })
    .catch(() => undefined)
}
