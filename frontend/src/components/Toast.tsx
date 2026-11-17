import { AnimatePresence, m } from 'motion/react'

/** Inline toast; the parent owns the message and clears it. */
export function Toast({ message, id = 0 }: { message: string | null; id?: number }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-[60] flex justify-center px-4">
      <AnimatePresence>
        {message && (
          <m.div
            key={id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            className="rounded-full border-2 border-line bg-plum px-5 py-2.5 font-display font-semibold text-cloud shadow-lg"
          >
            {message}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
