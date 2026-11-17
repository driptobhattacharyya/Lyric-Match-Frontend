import { m } from 'motion/react'

/** The lyric snippet, line by line, with a staggered reveal. */
export function LyricCard({ lyrics, label }: { lyrics: string; label?: string }) {
  const lines = lyrics
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  return (
    <figure className="card relative overflow-hidden px-5 pt-9 pb-6 sm:px-8">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-3 left-3 font-display text-8xl leading-none font-bold text-pop/80"
      >
        &ldquo;
      </span>
      {label && (
        <figcaption className="absolute top-3 right-4 max-w-[70%] truncate rounded-full bg-plum px-2.5 py-0.5 font-display text-xs font-semibold tracking-wide text-mist">
          {label}
        </figcaption>
      )}
      <blockquote className="relative space-y-1.5" aria-label="Lyric snippet">
        {lines.map((line, i) => (
          <m.p
            key={i}
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ delay: 0.12 + i * 0.12, duration: 0.4 }}
            className="font-display text-xl leading-snug font-medium text-balance text-cloud sm:text-2xl"
          >
            {line}
          </m.p>
        ))}
      </blockquote>
    </figure>
  )
}
