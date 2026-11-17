import { m } from 'motion/react'
import { useEffect, useEffectEvent, useRef, type ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
}

/** Accessible modal (bottom sheet on phones, centred dialog on wider screens): focus moves in, Escape closes, focus is trapped and restored. */
export function Modal({ title, onClose, children }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useEffectEvent(onClose)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const node = panel.current
    const first = node?.querySelector<HTMLElement>('[data-autofocus], button, [href], input')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key !== 'Tab' || !node) return
      const items = [...node.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')].filter(
        (el) => !el.hasAttribute('disabled'),
      )
      if (!items.length) return
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <m.div
        className="absolute inset-0 bg-ink/75 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <m.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ y: '100%', opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 34 }}
        className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] border-2 border-b-0 border-line bg-night p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-[2rem] sm:border-b-2 sm:p-7"
      >
        {children}
      </m.div>
    </div>
  )
}
