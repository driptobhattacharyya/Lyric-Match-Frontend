/**
 * Tiny synthesized sound effects (no audio files). Every sound is a few
 * enveloped oscillator notes; the AudioContext is created lazily on the first
 * user gesture so browsers' autoplay rules are respected.
 */
type Wave = OscillatorType

interface Note {
  freq: number
  at: number
  dur: number
  wave?: Wave
  gain?: number
  slideTo?: number
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false

export function setMuted(value: boolean) {
  muted = value
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try {
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = 0.32
      master.connect(ctx.destination)
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  return ctx
}

function play(notes: Note[]) {
  if (muted) return
  const ac = audio()
  if (!ac || !master) return
  const t0 = ac.currentTime + 0.01
  for (const n of notes) {
    const osc = ac.createOscillator()
    const g = ac.createGain()
    osc.type = n.wave ?? 'triangle'
    osc.frequency.setValueAtTime(n.freq, t0 + n.at)
    if (n.slideTo) osc.frequency.exponentialRampToValueAtTime(n.slideTo, t0 + n.at + n.dur)
    const peak = n.gain ?? 0.5
    g.gain.setValueAtTime(0.0001, t0 + n.at)
    g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur)
    osc.connect(g).connect(master)
    osc.start(t0 + n.at)
    osc.stop(t0 + n.at + n.dur + 0.05)
  }
}

// C major-ish pitches
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, D5 = 587.33, A5 = 880

export const sfx = {
  tap: () => play([{ freq: 660, at: 0, dur: 0.05, wave: 'sine', gain: 0.25 }]),
  select: () => play([{ freq: 520, at: 0, dur: 0.07, wave: 'square', gain: 0.08 }]),
  /** Brighter the longer the streak. */
  correct: (streak = 1) => {
    const lift = Math.pow(2, Math.min(streak - 1, 4) / 12)
    play([
      { freq: E5 * lift, at: 0, dur: 0.12 },
      { freq: G5 * lift, at: 0.08, dur: 0.12 },
      { freq: C6 * lift, at: 0.16, dur: 0.28, gain: 0.55 },
    ])
  },
  wrong: () =>
    play([
      { freq: 220, at: 0, dur: 0.16, wave: 'sawtooth', gain: 0.18, slideTo: 180 },
      { freq: 160, at: 0.14, dur: 0.26, wave: 'sawtooth', gain: 0.18, slideTo: 110 },
    ]),
  tick: (urgent = false) => play([{ freq: urgent ? 1200 : 900, at: 0, dur: 0.035, wave: 'square', gain: 0.06 }]),
  hint: () =>
    play([
      { freq: A5, at: 0, dur: 0.08, wave: 'sine', gain: 0.3 },
      { freq: C6 * 1.25, at: 0.07, dur: 0.16, wave: 'sine', gain: 0.25 },
    ]),
  timeUp: () =>
    play([
      { freq: 440, at: 0, dur: 0.14, wave: 'square', gain: 0.1 },
      { freq: 330, at: 0.16, dur: 0.3, wave: 'square', gain: 0.1 },
    ]),
  levelUp: () =>
    play([
      ...[C5, E5, G5, C6].map((f, i): Note => ({ freq: f, at: i * 0.09, dur: 0.22, gain: 0.45 })),
      { freq: C6, at: 0.4, dur: 0.5, wave: 'sine', gain: 0.4 },
      { freq: G5, at: 0.4, dur: 0.5, wave: 'sine', gain: 0.25 },
    ]),
  /** Soft thud when a heart breaks. */
  heart: () =>
    play([
      { freq: 300, at: 0, dur: 0.12, wave: 'sine', gain: 0.4, slideTo: 140 },
      { freq: 180, at: 0.1, dur: 0.18, wave: 'triangle', gain: 0.25, slideTo: 90 },
    ]),
  /** Rising sparkle for streak milestones. */
  streak: () => play([E5, G5, C6, E5 * 2].map((f, i): Note => ({ freq: f, at: i * 0.05, dur: 0.12, wave: 'sine', gain: 0.3 }))),
  /** Little tick per counted point burst on the results screen. */
  count: () => play([{ freq: 1320, at: 0, dur: 0.03, wave: 'sine', gain: 0.12 }]),
  fanfare: () =>
    play([
      { freq: G5, at: 0, dur: 0.12 },
      { freq: G5, at: 0.13, dur: 0.12 },
      { freq: D5 * 2, at: 0.26, dur: 0.4, gain: 0.55 },
    ]),
  start: () =>
    play([
      { freq: C5, at: 0, dur: 0.1, wave: 'sine' },
      { freq: G5, at: 0.08, dur: 0.18, wave: 'sine' },
    ]),
}

/** Short vibration where supported (Android Chrome); silently ignored elsewhere. */
export function buzz(pattern: number | number[]) {
  if (muted) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // ignore
  }
}
