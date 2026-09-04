import { useState } from 'react'

export default function StarRating({ value = 0, onChange, readonly = false, size = 'text-xl' }) {
  const [hovered, setHovered] = useState(0)
  const displayed = hovered || value

  return (
    <div className="flex items-center" onMouseLeave={() => !readonly && setHovered(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          onMouseEnter={() => !readonly && setHovered(star)}
          onClick={() => onChange?.(star)}
          className={`${size} leading-none transition ${readonly ? 'cursor-default' : 'hover:scale-110'}`}
        >
          <span className={star <= displayed ? 'text-amber-400' : 'text-muted-foreground/40'}>★</span>
        </button>
      ))}
    </div>
  )
}
