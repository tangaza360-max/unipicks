// The photo contains exactly what the student saw on screen: the same crop
// as CSS object-fit: cover, the same zoom, and mirrored for selfies.
import { assertAlmostEquals, assertEquals } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS module from the web app
import { clampZoom, drawCrop, nextTimer, pinchZoom, visibleCrop } from '../../../src/lib/cameraFrame.js'

Deno.test('landscape camera on a tall phone screen: crop the middle, full height', () => {
  // 640×480 camera, 390×844 screen → scale = 844/480; visible width = 390/scale
  const crop = visibleCrop(640, 480, 390, 844)!
  assertAlmostEquals(crop.sh, 480, 1e-9)
  assertAlmostEquals(crop.sw, 390 / (844 / 480), 1e-9)
  assertAlmostEquals(crop.sx, (640 - crop.sw) / 2, 1e-9)
  assertEquals(crop.sy, 0)
  // same shape as the screen
  assertAlmostEquals(crop.sw / crop.sh, 390 / 844, 1e-9)
})

Deno.test('portrait camera (phone): full frame when shapes match', () => {
  const crop = visibleCrop(1080, 1920, 390, 693.33)!
  assertAlmostEquals(crop.sw, 1080, 1)
  assertAlmostEquals(crop.sh, 1920, 1)
})

Deno.test('zoom 2× crops half the width and height, still centred', () => {
  const one = visibleCrop(1080, 1920, 390, 844, 1)!
  const two = visibleCrop(1080, 1920, 390, 844, 2)!
  assertAlmostEquals(two.sw, one.sw / 2, 1e-9)
  assertAlmostEquals(two.sh, one.sh / 2, 1e-9)
  assertAlmostEquals(two.sx + two.sw / 2, 540, 1e-9)
  assertAlmostEquals(two.sy + two.sh / 2, 960, 1e-9)
})

Deno.test('zoom stays between 1× and 4×', () => {
  assertEquals(clampZoom(0.5), 1)
  assertEquals(clampZoom(9), 4)
  assertEquals(clampZoom(NaN), 1)
  assertEquals(pinchZoom(1, 100, 250), 2.5)
  assertEquals(pinchZoom(2, 200, 50), 1)
  assertEquals(pinchZoom(3, 0, 50), 3)
})

Deno.test('no video yet → no crop', () => {
  assertEquals(visibleCrop(0, 0, 390, 844), null)
})

function recordingCtx() {
  const calls: unknown[][] = []
  const ctx = new Proxy({}, {
    get: (_t, name) => (...args: unknown[]) => calls.push([name, ...args]),
  })
  return { ctx, calls }
}

Deno.test('selfie (front camera) is mirrored like the preview', () => {
  const { ctx, calls } = recordingCtx()
  const size = drawCrop(ctx, 'video', { sx: 10, sy: 0, sw: 200.4, sh: 480 }, { mirror: true })
  assertEquals(size, { width: 200, height: 480 })
  assertEquals(calls, [
    ['save'],
    ['translate', 200, 0],
    ['scale', -1, 1],
    ['drawImage', 'video', 10, 0, 200.4, 480, 0, 0, 200, 480],
    ['restore'],
  ])
})

Deno.test('GIF frames: same crop drawn smaller', () => {
  const { ctx, calls } = recordingCtx()
  const size = drawCrop(ctx, 'video', { sx: 0, sy: 0, sw: 444, sh: 960 }, { mirror: true, width: 222, height: 480 })
  assertEquals(size, { width: 222, height: 480 })
  assertEquals(calls[1], ['translate', 222, 0])
  assertEquals(calls[3], ['drawImage', 'video', 0, 0, 444, 960, 0, 0, 222, 480])
})

Deno.test('back camera is not mirrored', () => {
  const { ctx, calls } = recordingCtx()
  drawCrop(ctx, 'video', { sx: 0, sy: 0, sw: 100, sh: 100 })
  assertEquals(calls.map((c) => c[0]), ['save', 'drawImage', 'restore'])
})

Deno.test('timer steps: off → 3 s → 10 s → off', () => {
  assertEquals(nextTimer(0), 3)
  assertEquals(nextTimer(3), 10)
  assertEquals(nextTimer(10), 0)
})
