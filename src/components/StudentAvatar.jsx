import { useMemo } from 'react'

const avatarSizes = {
  xs: 'h-8 w-8 text-xs',
  sm: 'h-10 w-10 text-sm',
  md: 'h-12 w-12 text-base',
  lg: 'h-16 w-16 text-xl',
  xl: 'h-24 w-24 text-3xl',
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return '?'
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase()
  }

  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase()
}

function getGradientSeed(value = '') {
  const normalized = value.trim().toLowerCase()

  let hash = 0

  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash << 5) - hash + normalized.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash)
}

export default function StudentAvatar({
  src,
  name = '',
  size = 'md',
  alt,
  className = '',
  ring = false,
}) {
  const initials = useMemo(() => getInitials(name), [name])
  const seed = useMemo(() => getGradientSeed(name), [name])

  const gradientAngle = seed % 360
  const secondAngle = (gradientAngle + 80) % 360

  return (
    <span
      className={[
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'bg-gradient-to-br from-accent/80 via-accent/40 to-foreground/20',
        'font-semibold text-foreground',
        avatarSizes[size] ?? avatarSizes.md,
        ring ? 'ring-2 ring-background' : '',
        className,
      ].join(' ')}
      style={{
        backgroundImage: `linear-gradient(${gradientAngle}deg, hsl(var(--color-primary)), hsl(var(--color-bg-interactive)) ${secondAngle}deg)`,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={alt ?? name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  )
}
