interface Props {
  size?: number
  spin?: boolean
  className?: string
}

/** Speech bubble holding a vinyl record: "lyrics" + "music". */
export function Logo({ size = 64, spin = false, className = '' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <path d="M20 4h24a16 16 0 0 1 16 16v14a16 16 0 0 1-16 16H30l-14 10 3-10.4A16 16 0 0 1 4 34V20A16 16 0 0 1 20 4Z" fill="var(--color-pop)" />
      <path d="M20 4h24a16 16 0 0 1 16 16v2H4v-2A16 16 0 0 1 20 4Z" fill="#fff" opacity="0.12" />
      <g className={spin ? 'animate-spin-slow' : undefined} style={{ transformOrigin: '32px 27px', transformBox: 'view-box' }}>
        <circle cx="32" cy="27" r="16" fill="var(--color-ink)" />
        <circle cx="32" cy="27" r="12.5" fill="none" stroke="#3a3180" strokeWidth="1.2" />
        <circle cx="32" cy="27" r="9.5" fill="none" stroke="#3a3180" strokeWidth="1.2" />
        <path d="M22.5 20.5a12 12 0 0 1 6-4.5" stroke="#fff" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="32" cy="27" r="6" fill="var(--color-sun)" />
        <circle cx="32" cy="27" r="1.6" fill="var(--color-ink)" />
      </g>
    </svg>
  )
}
