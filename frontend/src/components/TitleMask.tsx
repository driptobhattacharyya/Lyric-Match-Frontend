import { m } from 'motion/react'

interface Props {
  mask: string
  /** Original (unhinted) mask, so newly revealed letters can be highlighted. */
  baseMask: string
}

/** Renders the title mask as letter tiles, grouped by word so lines wrap cleanly. */
export function TitleMask({ mask, baseMask }: Props) {
  const words = splitWords(mask)
  const letters = [...mask].filter((c) => c !== ' ').length
  const hidden = [...mask].filter((c) => c === '_').length
  // Start index of each word in the full mask, so letters line up with baseMask.
  const starts = words.map((_, wi) => words.slice(0, wi).reduce((n, w) => n + w.length + 1, 0))
  return (
    <div
      className="flex flex-wrap justify-center gap-x-4 gap-y-2"
      role="img"
      aria-label={`Title: ${letters} characters, ${hidden} hidden. ${mask.replace(/_/g, ' blank ')}`}
    >
      {words.map((word, wi) => {
        const start = starts[wi]
        return (
          <span key={wi} className="flex gap-1">
            {[...word].map((ch, ci) => {
              const pos = start + ci
              const blank = ch === '_'
              const isLetter = /[\p{L}\p{N}]/u.test(ch)
              const fresh = !blank && baseMask[pos] === '_'
              if (!blank && !isLetter) {
                return (
                  <span key={ci} className="grid h-9 w-3 place-items-end pb-1 font-display text-lg font-bold text-mist">
                    {ch}
                  </span>
                )
              }
              return (
                <m.span
                  key={`${ci}-${ch}`}
                  initial={fresh ? { rotateY: 90, scale: 0.6 } : false}
                  animate={{ rotateY: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 18, delay: fresh ? ci * 0.03 : 0 }}
                  className={`grid h-9 w-7 place-items-center rounded-lg border-b-4 font-display text-lg font-bold uppercase sm:h-10 sm:w-8 ${
                    blank ? 'border-line bg-plum/70' : fresh ? 'border-sun-deep bg-sun text-ink' : 'border-line bg-plum text-cloud'
                  }`}
                >
                  {blank ? '' : ch}
                </m.span>
              )
            })}
          </span>
        )
      })}
    </div>
  )
}

function splitWords(mask: string): string[] {
  return mask.split(' ')
}
