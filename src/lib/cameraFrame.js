// Picture maths for the camera (no DOM needed, so it can be unit-tested).
//
// The preview shows the camera with CSS `object-fit: cover`, zoomed in by
// `zoom` around the centre, and mirrored for the front camera. A photo must
// contain exactly what the student saw, so we crop the same area.

export const MIN_ZOOM = 1
export const MAX_ZOOM = 4

export function clampZoom(value) {
  if (!Number.isFinite(value)) return MIN_ZOOM
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

// Area of the video frame (in video pixels) that is visible in a box of
// boxWidth × boxHeight with object-fit: cover, then zoomed by `zoom`.
export function visibleCrop(videoWidth, videoHeight, boxWidth, boxHeight, zoom = 1) {
  if (!videoWidth || !videoHeight || !boxWidth || !boxHeight) return null
  const scale = Math.max(boxWidth / videoWidth, boxHeight / videoHeight) * clampZoom(zoom)
  const sw = Math.min(videoWidth, boxWidth / scale)
  const sh = Math.min(videoHeight, boxHeight / scale)
  return {
    sx: (videoWidth - sw) / 2,
    sy: (videoHeight - sh) / 2,
    sw,
    sh,
  }
}

// Draw the crop onto a 2D context of size crop.sw × crop.sh (rounded),
// mirrored when `mirror` is true (front camera, as seen on screen).
export function drawCrop(ctx, source, crop, { mirror = false } = {}) {
  const width = Math.round(crop.sw)
  const height = Math.round(crop.sh)
  ctx.save()
  if (mirror) {
    ctx.translate(width, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height)
  ctx.restore()
  return { width, height }
}

// New zoom after a pinch: the distance between two fingers changed from
// startDistance to distance.
export function pinchZoom(startZoom, startDistance, distance) {
  if (!startDistance) return clampZoom(startZoom)
  return clampZoom(startZoom * (distance / startDistance))
}

export const TIMER_STEPS = [0, 3, 10]
export function nextTimer(seconds) {
  const index = TIMER_STEPS.indexOf(seconds)
  return TIMER_STEPS[(index + 1) % TIMER_STEPS.length]
}
