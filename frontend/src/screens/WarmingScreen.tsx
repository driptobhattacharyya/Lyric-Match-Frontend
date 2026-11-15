import { m } from 'motion/react'
import { Equalizer } from '../components/Equalizer'
import { Logo } from '../components/Logo'

/**
 * Shown while the backend boots. For the first ~3 seconds it is a plain
 * "tuning up" loader; the friendlier explanation fades in only if the wait
 * drags on (pure CSS animation delay, no timers).
 */
export function WarmingScreen({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center" role="status" aria-live="polite">
      <div className="relative">
        <m.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
          <Logo size={120} spin />
        </m.div>
        <span className="absolute -right-6 -bottom-2 rotate-12 animate-fade-late rounded-full bg-sun px-2.5 py-0.5 font-display text-sm font-bold text-ink">
          zzz
        </span>
      </div>
      <Equalizer bars={7} />
      <div className="space-y-2">
        <h2 className="font-display text-2xl font-bold">Tuning up…</h2>
        <div className="animate-fade-late space-y-2">
          <p className="font-display text-xl font-semibold text-sun">Waking up the server</p>
          <p className="mx-auto max-w-xs text-mist">
            It naps when nobody is playing. The first wake-up can take up to a minute. The clock won’t start until it’s ready.
          </p>
        </div>
      </div>
      <button type="button" onClick={onCancel} className="btn-chunk btn-ghost animate-fade-late text-base">
        Back to home
      </button>
    </div>
  )
}
