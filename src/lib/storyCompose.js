// Draw text / place overlays into the final story file (photo or camera GIF).
import { drawOverlays } from './storyOverlays.js'
import { makeGif } from './gifMaker.js'
import { STORY_MAX_BYTES } from './studentStories.js'

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("We couldn't read this photo. Please try again."))
    img.src = url
  })
}

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("We couldn't save this photo. Please try again."))),
      'image/jpeg',
      0.9
    )
  )
}

// file: the photo/GIF shown in the preview. previewUrl: its object URL.
// gifSource: { frames, width, height, boomerang } for GIFs made by the camera
// (their frames are drawn again with the overlays); null otherwise.
// Returns the same file when there is nothing to draw.
export async function composeStoryFile({ file, previewUrl, overlays, gifSource }) {
  const items = (overlays || []).filter((o) => String(o.text || '').trim())
  if (!items.length) return file

  if (file.type === 'image/gif') {
    if (!gifSource) throw new Error("Text and places can't be added to a GIF from your phone.")
    const { width, height } = gifSource
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const frames = gifSource.frames.map((frame) => {
      ctx.putImageData(new ImageData(new Uint8ClampedArray(frame), width, height), 0, 0)
      drawOverlays(ctx, width, height, items)
      return ctx.getImageData(0, 0, width, height).data
    })
    const { bytes } = await makeGif(frames, width, height, {
      boomerang: gifSource.boomerang,
      maxBytes: STORY_MAX_BYTES,
    })
    return new File([bytes], file.name || `unipicks-${Date.now()}.gif`, { type: 'image/gif' })
  }

  const img = await loadImage(previewUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  drawOverlays(ctx, canvas.width, canvas.height, items)
  const blob = await canvasToJpeg(canvas)
  return new File([blob], `unipicks-${Date.now()}.jpg`, { type: 'image/jpeg' })
}
