// Text and place on a story photo (camera part 4, founder decision
// 2026-10-05: text like Snapchat, a place name like Instagram, no GPS).
//
// An overlay is { kind: 'text' | 'place', text, color, x, y } where x, y are
// the centre as fractions (0–1) of the photo, so the same overlay can be drawn
// on the preview (any screen size), on the full photo and on small GIF frames.

export const TEXT_MAX = 60
export const TEXT_COLORS = { white: '#ffffff', black: '#111111' }

// Where an image with object-fit: contain sits inside its box.
export function containRect(imageWidth, imageHeight, boxWidth, boxHeight) {
  if (!imageWidth || !imageHeight || !boxWidth || !boxHeight) return null
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight)
  const w = imageWidth * scale
  const h = imageHeight * scale
  return { x: (boxWidth - w) / 2, y: (boxHeight - h) / 2, w, h }
}

export function clampPosition(value) {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(0.95, Math.max(0.05, value))
}

// Moving without dragging (WCAG 2.5.7): three spots to pick with one tap,
// and arrow keys move a sticker by small steps.
export const SPOTS = [
  { id: 'top', label: 'Top', y: 0.2 },
  { id: 'middle', label: 'Middle', y: 0.45 },
  { id: 'bottom', label: 'Bottom', y: 0.65 },
]
export const NUDGE = 0.05

export function nearestSpot(y) {
  if (!Number.isFinite(y)) return 'middle'
  return SPOTS.reduce((best, spot) => (Math.abs(spot.y - y) < Math.abs(best.y - y) ? spot : best)).id
}

// Arrow key → new position, or null for other keys.
export function nudge(key, x, y) {
  const moves = { ArrowUp: [0, -NUDGE], ArrowDown: [0, NUDGE], ArrowLeft: [-NUDGE, 0], ArrowRight: [NUDGE, 0] }
  const move = moves[key]
  if (!move) return null
  return { x: clampPosition(x + move[0]), y: clampPosition(y + move[1]) }
}

export function cleanText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX)
}

// Font size in pixels for an overlay on a photo `width` pixels wide.
export function fontSize(kind, width) {
  return Math.max(10, Math.round(width * (kind === 'place' ? 0.045 : 0.07)))
}

const FONT = (size) => `600 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`

// Draw all overlays on a 2D context of size width × height. Text shrinks to
// fit 90% of the width. Text gets a soft shadow; a place is a white pill.
export function drawOverlays(ctx, width, height, overlays) {
  for (const overlay of overlays || []) {
    const text = overlay.kind === 'place' ? `📍 ${cleanText(overlay.text)}` : cleanText(overlay.text)
    if (!cleanText(overlay.text)) continue
    let size = fontSize(overlay.kind, width)
    ctx.font = FONT(size)
    const maxWidth = width * 0.9
    let measured = ctx.measureText(text).width
    if (measured > maxWidth) {
      size = Math.max(8, Math.floor((size * maxWidth) / measured))
      ctx.font = FONT(size)
      measured = ctx.measureText(text).width
    }
    const cx = clampPosition(overlay.x) * width
    const cy = clampPosition(overlay.y) * height
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (overlay.kind === 'place') {
      const padX = size * 0.6
      const padY = size * 0.4
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.beginPath()
      const box = [cx - measured / 2 - padX, cy - size / 2 - padY, measured + 2 * padX, size + 2 * padY]
      // roundRect is missing on older phones (Safari < 16): plain box instead.
      if (typeof ctx.roundRect === 'function') ctx.roundRect(...box, size)
      else ctx.rect(...box)
      ctx.fill()
      ctx.fillStyle = '#111111'
    } else {
      ctx.shadowColor = overlay.color === 'black' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)'
      ctx.shadowBlur = Math.max(2, size / 6)
      ctx.fillStyle = TEXT_COLORS[overlay.color] || TEXT_COLORS.white
    }
    ctx.fillText(text, cx, cy)
    ctx.restore()
  }
}
