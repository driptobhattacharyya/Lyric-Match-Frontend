import type { SVGProps } from 'react'

/** Hand-drawn, rounded stroke icons for Lyric Match. */
const PATHS = {
  note: <path d="M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />,
  flame: (
    <path d="M12 22c4 0 7-2.8 7-6.8 0-3.4-2.2-5.6-3.6-7.4-.4 1.8-1.4 3-2.6 3.4.4-3.4-1-6.6-4.3-9.2.3 3.4-1.4 5.4-3 7.4C4.4 11 3.9 12.8 4.4 15c.7 4.3 3.7 7 7.6 7Z" />
  ),
  crown: <path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" />,
  ear: (
    <path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5.5 1.6M10 9.5a2 2 0 0 1 4 0c0 1.3-1.5 1.7-1.5 3" />
  ),
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  disc: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M7.5 8.5a5.5 5.5 0 0 1 3-2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M8 3v4M16 3v4M3.5 10h17M9 15l2 2 4-4" />
    </>
  ),
  heart: (
    <path d="M12 20s-7.5-4.4-9-9.3C2 7.4 4.2 4.5 7.4 4.5c2 0 3.6 1.2 4.6 2.8 1-1.6 2.6-2.8 4.6-2.8 3.2 0 5.4 2.9 4.4 6.2C19.5 15.6 12 20 12 20Z" />
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  volume: <path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4Zm12-.5a4 4 0 0 1 0 6m2.5-8.5a7.5 7.5 0 0 1 0 11" />,
  mute: <path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4Zm12 0 5 5m0-5-5 5" />,
  chart: <path d="M4 20V10m6 10V4m6 16v-7m4 7H3" />,
  share: <path d="M12 3v12m0-12L7.5 7.5M12 3l4.5 4.5M5 13v5a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-5" />,
  home: <path d="M3.5 11 12 4l8.5 7M6 9.5V20h4.5v-5h3v5H18V9.5" />,
  replay: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" />,
  bulb: (
    <path d="M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3Z" />
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  flag: <path d="M5 21V4m0 0h11l-2 4 2 4H5" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  wifi: <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0M12 19.5h.01" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0V4Zm0 2H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4m-4 3h8m-6.5 0 .5-3h4l.5 3" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z" />
    </>
  ),
  sparkle: <path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Zm7 12c.3 1.7 1.2 2.6 3 3-1.8.4-2.7 1.3-3 3-.3-1.7-1.2-2.6-3-3 1.8-.4 2.7-1.3 3-3Z" />,
  play: <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" />,
} as const

export type IconName = keyof typeof PATHS

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
  filled?: boolean
}

export function Icon({ name, size = 24, filled = false, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
