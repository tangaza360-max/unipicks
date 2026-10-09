import { useState } from 'react'
import { Star } from 'lucide-react'

// 1–5 stars. As an input, each star is a button that says which number it is
// and whether it is the chosen one; read-only, it's one picture with a name.
export default function StarRating({ value = 0, onChange, readonly = false, iconSize = 22, label = 'Your rating' }) {
  const [hovered, setHovered] = useState(0)
  const displayed = hovered || value

  if (readonly) {
    return (
      <span role="img" aria-label={`${value} out of 5 stars`} className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star key={star} size={iconSize} aria-hidden="true" className={star <= value ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-muted-foreground/40'} />
        ))}
      </span>
    )
  }

  return (
    <div role="group" aria-label={label} className="flex items-center" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          aria-pressed={value === star}
          onMouseEnter={() => setHovered(star)}
          onClick={() => onChange?.(star)}
          className="flex h-10 w-10 items-center justify-center leading-none transition hover:scale-110"
        >
          <Star
            size={iconSize}
            aria-hidden="true"
            className={star <= displayed ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-muted-foreground/40'}
          />
        </button>
      ))}
    </div>
  )
}
