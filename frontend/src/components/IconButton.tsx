import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
}

export function IconButton({ icon, label, className = '', ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl border-2 border-line bg-night text-mist transition hover:border-mist/60 hover:text-cloud active:translate-y-0.5 ${className}`}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  )
}
