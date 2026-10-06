// Text and place on story photos: positions are fractions of the photo, so
// the preview, the full photo and small GIF frames all match.
import { assert, assertEquals } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS module from the web app
import { clampPosition, cleanText, containRect, drawOverlays, fontSize, nearestSpot, nudge, SPOTS, TEXT_MAX } from '../../../src/lib/storyOverlays.js'

Deno.test('photo shown with object-fit: contain inside the screen box', () => {
  // tall photo in a taller box: full width, centred vertically
  assertEquals(containRect(222, 480, 390, 844), { x: 0, y: (844 - 480 * (390 / 222)) / 2, w: 390, h: 480 * (390 / 222) })
  // wide photo: full width, bars top and bottom
  const r = containRect(1000, 500, 390, 844)!
  assertEquals([r.x, r.w, r.h], [0, 390, 195])
  assertEquals(containRect(0, 0, 390, 844), null)
})

Deno.test('positions stay on the photo', () => {
  assertEquals(clampPosition(-1), 0.05)
  assertEquals(clampPosition(2), 0.95)
  assertEquals(clampPosition(0.3), 0.3)
  assertEquals(clampPosition(NaN), 0.5)
})

Deno.test('text is tidied and limited to 60 characters', () => {
  assertEquals(cleanText('  Lunch \n time  '), 'Lunch time')
  assertEquals(cleanText('a'.repeat(80)).length, TEXT_MAX)
})

Deno.test('font grows with the photo (same look on GIF frames and full photos)', () => {
  assertEquals(fontSize('text', 1000), 70)
  assertEquals(fontSize('place', 1000), 45)
  assertEquals(fontSize('text', 222), 16)
})

function recordingCtx(charWidth = 10) {
  const calls: unknown[][] = []
  const ctx: Record<string, unknown> = {}
  for (const name of ['save', 'restore', 'fillText', 'beginPath', 'roundRect', 'fill']) {
    ctx[name] = (...args: unknown[]) => calls.push([name, ...args])
  }
  ctx.measureText = (t: string) => ({ width: [...t].length * charWidth })
  return { ctx, calls }
}

Deno.test('text drawn at its place on the photo; place gets a pill and a pin', () => {
  const { ctx, calls } = recordingCtx(5)
  drawOverlays(ctx, 1000, 2000, [
    { kind: 'text', text: 'Lunch', color: 'white', x: 0.5, y: 0.25 },
    { kind: 'place', text: 'Mr. Chips', x: 0.2, y: 0.8 },
    { kind: 'text', text: '   ', x: 0.5, y: 0.5 },
  ])
  const texts = calls.filter((c) => c[0] === 'fillText')
  assertEquals(texts, [['fillText', 'Lunch', 500, 500], ['fillText', '📍 Mr. Chips', 200, 1600]])
  assertEquals(calls.filter((c) => c[0] === 'roundRect').length, 1, 'only the place has a pill')
})

Deno.test('long text shrinks to fit 90% of the width', () => {
  const { ctx } = recordingCtx(40)
  drawOverlays(ctx, 400, 800, [{ kind: 'text', text: 'a'.repeat(30), color: 'white', x: 0.5, y: 0.5 }])
  const font = String(ctx.font)
  const size = Number(font.match(/(\d+)px/)![1])
  assert(size < fontSize('text', 400), font)
})

Deno.test('moving without dragging: nearest spot, and arrow keys', () => {
  assertEquals(SPOTS.map((s) => s.id), ['top', 'middle', 'bottom'])
  assertEquals(nearestSpot(0.1), 'top')
  assertEquals(nearestSpot(0.4), 'middle')
  assertEquals(nearestSpot(0.9), 'bottom')
  assertEquals(nearestSpot(undefined), 'middle')
  assertEquals(nudge('ArrowUp', 0.5, 0.5), { x: 0.5, y: 0.45 })
  assertEquals(nudge('ArrowLeft', 0.5, 0.5), { x: 0.45, y: 0.5 })
  assertEquals(nudge('ArrowDown', 0.5, 0.95), { x: 0.5, y: 0.95 }, 'stays on the photo')
  assertEquals(nudge('Enter', 0.5, 0.5), null)
})
