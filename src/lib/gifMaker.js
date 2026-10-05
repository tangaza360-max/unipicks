// Short GIFs from the camera (founder decision 2026-10-05: no video; hold the
// shutter for up to 3 seconds, or Boomerang). Silent, loops forever.
// Small on purpose (mobile data, 5 MB story limit): longest side 480 px,
// 10 frames per second.
import { GIFEncoder, applyPalette, quantize } from 'gifenc'

export const GIF_FPS = 10
export const GIF_MAX_SECONDS = 3
export const BOOMERANG_SECONDS = 2
export const GIF_MAX_SIDE = 480

// Output size for a crop, longest side at most GIF_MAX_SIDE, even numbers.
export function gifSize(cropWidth, cropHeight, maxSide = GIF_MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(cropWidth, cropHeight))
  const even = (n) => Math.max(2, Math.round((n * scale) / 2) * 2)
  return { width: even(cropWidth), height: even(cropHeight) }
}

// Boomerang: forward, then backward without repeating the two ends.
export function boomerangOrder(count) {
  const forward = Array.from({ length: count }, (_, i) => i)
  return count < 3 ? forward : [...forward, ...forward.slice(1, -1).reverse()]
}

// One palette for the whole GIF (from up to 6 frames): smaller file, no
// colour flicker between frames.
function sharedPalette(frames, colors) {
  const step = Math.max(1, Math.floor(frames.length / 6))
  const picked = frames.filter((_, i) => i % step === 0).slice(0, 6)
  const sample = new Uint8ClampedArray(picked.reduce((n, f) => n + f.length, 0))
  let offset = 0
  for (const frame of picked) {
    sample.set(frame, offset)
    offset += frame.length
  }
  return quantize(sample, colors)
}

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0))

// frames: RGBA pixel arrays (width × height × 4). Returns the GIF bytes.
// If the file is over maxBytes, tries again with fewer colours, then with
// every second frame. Throws a plain-English error if it still does not fit.
export async function makeGif(frames, width, height, { boomerang = false, maxBytes = 5 * 1024 * 1024, onProgress } = {}) {
  if (!frames.length) throw new Error('Hold the button a little longer to make a GIF.')

  const attempts = [
    { colors: 256, step: 1 },
    { colors: 128, step: 1 },
    { colors: 64, step: 2 },
  ]

  for (const { colors, step } of attempts) {
    const used = frames.filter((_, i) => i % step === 0)
    const order = boomerang ? boomerangOrder(used.length) : used.map((_, i) => i)
    const palette = sharedPalette(used, colors)
    const indexed = used.map((frame) => applyPalette(frame, palette))
    const gif = GIFEncoder()

    for (let n = 0; n < order.length; n += 1) {
      gif.writeFrame(indexed[order[n]], width, height, {
        palette,
        delay: (1000 / GIF_FPS) * step,
        repeat: 0,
      })
      if (n % 5 === 4) {
        onProgress?.((n + 1) / order.length)
        await nextTick()
      }
    }
    gif.finish()
    const bytes = gif.bytes()
    if (bytes.length <= maxBytes) {
      return { bytes, frameCount: order.length, colors }
    }
  }

  throw new Error('This GIF is too big. Try a shorter one.')
}
