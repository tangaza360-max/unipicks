import { useState } from 'react'
import { Star } from 'lucide-react'

export default function StarRating({ value = 0, onChange, readonly = false, iconSize = 22 }) {
  const [hovered, setHovered] = useState(0)
  const displayed = hovered || value

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => !readonly && setHovered(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          onMouseEnter={() => !readonly && setHovered(star)}
          onClick={() => onChange?.(star)}
          className={`leading-none transition ${readonly ? 'cursor-default' : 'hover:scale-110'}`}
        >
          <Star
            size={iconSize}
            className={star <= displayed ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-muted-foreground/40'}
          />
        </button>
      ))}
    </div>
  )
}
