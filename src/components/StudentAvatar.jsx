import { useEffect, useMemo, useState } from 'react'
import { useStudentAvatar } from '../lib/studentAvatars.js'

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

// userId: show that student's profile picture (if they have one and you
// may see it); otherwise their initials.
export default function StudentAvatar({
  src,
  userId,
  name = '',
  size = 'md',
  alt,
  className = '',
  ring = false,
}) {
  const initials = useMemo(() => getInitials(name), [name])
  const fetched = useStudentAvatar(src ? null : userId)
  const picture = src || fetched
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [picture])

  return (
    <span
      // alt="" means the photo sits next to the written name: decorative, so
      // screen readers skip the photo and the initials (WCAG 1.1.1, 2.5.3).
      aria-hidden={alt === '' ? 'true' : undefined}
      className={[
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        // Solid brand circle with dark initials (same pair as the main
        // buttons, so the contrast is already checked). The old gradient had
        // a colour stop in "deg", which browsers reject, so no circle showed.
        'bg-primary font-semibold text-primary-foreground',
        avatarSizes[size] ?? avatarSizes.md,
        ring ? 'ring-2 ring-background' : '',
        className,
      ].join(' ')}
    >
      {picture && !failed ? (
        <img
          src={picture}
          alt={alt ?? name}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        // Drawn by CSS, not as text: initials are a picture of the name, so
        // they must not become part of a button's name (WCAG 2.5.3).
        <span aria-hidden="true" data-initials={initials} className="before:content-[attr(data-initials)]" />
      )}
    </span>
  )
}
