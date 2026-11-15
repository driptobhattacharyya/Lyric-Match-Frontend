import confetti from 'canvas-confetti'

const COLORS = ['#ff4f8b', '#ffd23f', '#2de2e6', '#9b7bff', '#3ee08f']

function reduced(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function burst(intensity: 'small' | 'big' = 'small') {
  if (reduced()) return
  const big = intensity === 'big'
  void confetti({
    particleCount: big ? 140 : 50,
    spread: big ? 100 : 70,
    startVelocity: big ? 48 : 36,
    origin: { y: big ? 0.6 : 0.75 },
    colors: COLORS,
    scalar: big ? 1.1 : 0.9,
    disableForReducedMotion: true,
  })
  if (big) {
    void confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors: COLORS, disableForReducedMotion: true })
    void confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors: COLORS, disableForReducedMotion: true })
  }
}
