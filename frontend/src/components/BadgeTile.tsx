import { m } from 'motion/react'
import type { BadgeDef, BadgeId } from '../game/progression'
import { Icon, type IconName } from './Icon'

interface Props {
  badge: BadgeDef
  earned: boolean
  fresh?: boolean
  delay?: number
}

const LOOK: Record<BadgeId, { icon: IconName; tint: string }> = {
  first_note: { icon: 'note', tint: 'bg-aqua' },
  on_fire: { icon: 'flame', tint: 'bg-pop' },
  flawless: { icon: 'crown', tint: 'bg-sun' },
  ear_only: { icon: 'ear', tint: 'bg-grape' },
  speed_demon: { icon: 'bolt', tint: 'bg-sun' },
  platinum: { icon: 'disc', tint: 'bg-cloud' },
  three_day: { icon: 'calendar', tint: 'bg-mint' },
  polyglot: { icon: 'globe', tint: 'bg-aqua' },
  no_sweat: { icon: 'heart', tint: 'bg-coral' },
}

export function BadgeTile({ badge, earned, fresh = false, delay = 0 }: Props) {
  const { icon, tint } = LOOK[badge.id]
  return (
    <m.li
      initial={fresh ? { scale: 0, rotate: -30 } : false}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 14, delay }}
      className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-center ${
        earned ? 'border-line bg-plum/60' : 'border-dashed border-line/70 bg-transparent'
      }`}
    >
      <span
        className={`grid size-12 place-items-center rounded-full ${earned ? `${tint} text-ink` : 'bg-plum text-mist/70'}`}
        aria-hidden="true"
      >
        <Icon name={earned ? icon : 'lock'} size={24} />
      </span>
      <span className={`font-display text-sm leading-tight font-semibold ${earned ? 'text-cloud' : 'text-mist'}`}>{badge.name}</span>
      <span className="text-xs leading-tight text-mist">{badge.description}</span>
      <span className="sr-only">{earned ? 'Earned' : 'Locked'}</span>
    </m.li>
  )
}
