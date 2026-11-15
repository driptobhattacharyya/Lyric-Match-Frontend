/** Bouncing equalizer bars, used as the loading indicator. */
export function Equalizer({ bars = 5, className = '' }: { bars?: number; className?: string }) {
  const colors = ['bg-pop', 'bg-sun', 'bg-aqua', 'bg-grape', 'bg-mint']
  return (
    <div className={`flex h-12 items-end gap-1.5 ${className}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={`h-full w-2.5 origin-bottom animate-eq rounded-full ${colors[i % colors.length]}`}
          style={{ animationDelay: `${(i * 0.13) % 0.9}s` }}
        />
      ))}
    </div>
  )
}
