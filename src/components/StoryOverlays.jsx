import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { TEXT_COLORS, TEXT_MAX, clampPosition, cleanText, containRect, fontSize } from '../lib/storyOverlays.js'
import Button from './Button.jsx'

// Text and place stickers on the story preview. Positions are fractions of
// the photo (see storyOverlays.js), so what you see is what gets posted.

// Draggable stickers placed exactly over the photo (object-fit: contain).
export function OverlayLayer({ imageRef, overlays, onMove, onTapText }) {
  const [rect, setRect] = useState(null)
  const dragRef = useRef(null)

  useLayoutEffect(() => {
    const img = imageRef.current
    if (!img) return
    const measure = () => {
      const box = img.getBoundingClientRect()
      setRect(containRect(img.naturalWidth, img.naturalHeight, box.width, box.height))
    }
    if (img.complete) measure()
    img.addEventListener('load', measure)
    window.addEventListener('resize', measure)
    return () => {
      img.removeEventListener('load', measure)
      window.removeEventListener('resize', measure)
    }
  }, [imageRef])

  if (!rect) return null

  const start = (event, index) => {
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = { index, x: event.clientX, y: event.clientY, moved: false }
  }
  const move = (event) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 6) return
    drag.moved = true
    drag.x = event.clientX
    drag.y = event.clientY
    const current = overlays[drag.index]
    onMove(drag.index, clampPosition(current.x + dx / rect.w), clampPosition(current.y + dy / rect.h))
  }
  const end = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag && !drag.moved && overlays[drag.index]?.kind === 'text') onTapText()
  }

  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      data-testid="overlay-layer"
    >
      {overlays.map((overlay, index) => {
        const size = fontSize(overlay.kind, rect.w)
        const isPlace = overlay.kind === 'place'
        return (
          <button
            key={overlay.kind}
            type="button"
            onPointerDown={(event) => start(event, index)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            aria-label={isPlace ? `Place: ${overlay.text}. Drag to move` : `Text: ${overlay.text}. Drag to move, tap to edit`}
            className={`pointer-events-auto absolute max-w-[90%] -translate-x-1/2 -translate-y-1/2 select-none whitespace-nowrap font-semibold ${
              isPlace ? 'rounded-full bg-white/90 text-[#111]' : ''
            }`}
            style={{
              left: `${overlay.x * 100}%`,
              top: `${overlay.y * 100}%`,
              fontSize: size,
              lineHeight: 1.2,
              padding: isPlace ? `${size * 0.4}px ${size * 0.6}px` : '4px',
              color: isPlace ? undefined : TEXT_COLORS[overlay.color] || TEXT_COLORS.white,
              textShadow: isPlace ? undefined : overlay.color === 'black' ? '0 0 6px rgba(255,255,255,.6)' : '0 0 6px rgba(0,0,0,.6)',
              touchAction: 'none',
              minHeight: 44,
            }}
          >
            {isPlace ? `📍 ${overlay.text}` : overlay.text}
          </button>
        )
      })}
    </div>
  )
}

export function TextEditor({ initial, onDone, onRemove, onCancel }) {
  const [text, setText] = useState(initial?.text || '')
  const [color, setColor] = useState(initial?.color || 'white')
  const inputRef = useRef(null)
  useEffect(() => inputRef.current?.focus(), [])

  return (
    <div role="dialog" aria-label="Add text" className="absolute inset-0 z-40 flex flex-col justify-center bg-black/75 px-6">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onDone({ text: cleanText(text), color })
        }}
        className="mx-auto w-full max-w-md space-y-4"
      >
        <label htmlFor="story-text" className="sr-only">Text on the photo</label>
        <input
          ref={inputRef}
          id="story-text"
          value={text}
          maxLength={TEXT_MAX}
          onChange={(event) => setText(event.target.value)}
          placeholder="Type something"
          className="w-full bg-transparent text-center text-3xl font-semibold outline-none placeholder:text-white/60"
          style={{ color: TEXT_COLORS[color], textShadow: color === 'black' ? '0 0 6px rgba(255,255,255,.7)' : 'none' }}
        />
        <p className="text-center text-xs text-white/90">{text.length}/{TEXT_MAX}</p>
        <div role="radiogroup" aria-label="Text colour" className="flex justify-center gap-3">
          {Object.keys(TEXT_COLORS).map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={color === name}
              onClick={() => setColor(name)}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold capitalize ${
                color === name ? 'border-white bg-white text-black' : 'border-white/60 text-white'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {initial ? (
            <button type="button" onClick={onRemove} className="min-h-11 rounded-lg border border-white/50 text-sm font-semibold text-white">
              Remove text
            </button>
          ) : (
            <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-white/50 text-sm font-semibold text-white">
              Cancel
            </button>
          )}
          <Button type="submit" disabled={!cleanText(text)}>Done</Button>
        </div>
      </form>
    </div>
  )
}

// Places: your campus and the approved businesses on Unipicks. No GPS.
export function PlacePicker({ hasPlace, onPick, onRemove, onCancel }) {
  const [places, setPlaces] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [{ data: { user } }, { data: businesses }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('merchant_profiles').select('business_name').eq('approved', true).order('business_name').limit(100),
      ])
      if (cancelled) return
      const list = []
      const campus = user?.app_metadata?.university
      if (campus) list.push({ text: campus, kind: 'Campus' })
      for (const b of businesses || []) {
        const name = String(b.business_name || '').trim()
        if (name && !list.some((p) => p.text === name)) list.push({ text: name, kind: 'Business' })
      }
      setPlaces(list)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/60" onClick={onCancel}>
      <div
        role="dialog"
        aria-label="Add a place"
        className="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-t-xl bg-card p-4 text-foreground"
        style={{ paddingBottom: 'calc(var(--safe-area-bottom) + 16px)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Add a place</h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted">
            <X size={20} />
          </button>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">Only the name is added. Your location is not used.</p>
        {places === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="divide-y divide-border">
            {places.map((place) => (
              <li key={place.text}>
                <button
                  type="button"
                  onClick={() => onPick(place.text)}
                  className="flex min-h-11 w-full items-center gap-3 py-2 text-left hover:bg-muted/50"
                >
                  <MapPin size={18} className="text-muted-foreground" />
                  <span className="flex-1 font-medium">{place.text}</span>
                  <span className="text-xs text-muted-foreground">{place.kind}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {hasPlace && (
          <button type="button" onClick={onRemove} className="mt-3 min-h-11 w-full rounded-lg border border-border text-sm font-semibold">
            Remove place
          </button>
        )}
      </div>
    </div>
  )
}
