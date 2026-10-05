// Camera GIFs: valid GIF files that loop forever at 10 frames per second,
// Boomerang plays forward then backward, and files stay under the 5 MB story
// limit (fewer colours / frames when needed, else a plain-English error).
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS module from the web app
import { boomerangOrder, gifSize, makeGif } from '../../../src/lib/gifMaker.js'

// Minimal GIF reader: counts images, reads frame delays and the loop count.
function readGif(bytes: Uint8Array) {
  const header = new TextDecoder().decode(bytes.slice(0, 6))
  let p = 6
  const width = bytes[p] | (bytes[p + 1] << 8)
  const height = bytes[p + 2] | (bytes[p + 3] << 8)
  const flags = bytes[p + 4]
  p += 7
  if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1))
  const delays: number[] = []
  let images = 0
  let loop: number | null = null
  const skipSubBlocks = () => {
    while (bytes[p] !== 0) p += bytes[p] + 1
    p += 1
  }
  while (p < bytes.length) {
    const block = bytes[p++]
    if (block === 0x3b) break
    if (block === 0x21) {
      const label = bytes[p++]
      if (label === 0xf9) {
        delays.push(bytes[p + 2] | (bytes[p + 3] << 8))
      } else if (label === 0xff && new TextDecoder().decode(bytes.slice(p + 1, p + 12)) === 'NETSCAPE2.0') {
        loop = bytes[p + 14] | (bytes[p + 15] << 8)
      }
      skipSubBlocks()
    } else if (block === 0x2c) {
      images += 1
      const local = bytes[p + 8]
      p += 9
      if (local & 0x80) p += 3 * (1 << ((local & 7) + 1))
      p += 1 // LZW minimum code size
      skipSubBlocks()
    } else {
      throw new Error(`bad block 0x${block.toString(16)} at ${p - 1}`)
    }
  }
  return { header, width, height, images, delays, loop }
}

// A moving square on a gradient: like a real camera frame, compresses a bit.
function frames(count: number, w: number, h: number, noise = false) {
  return Array.from({ length: count }, (_, f) => {
    const px = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const inSquare = x >= f * 3 && x < f * 3 + 20 && y >= 40 && y < 60
        px[i] = noise ? Math.random() * 255 : inSquare ? 255 : x
        px[i + 1] = noise ? Math.random() * 255 : inSquare ? 40 : y
        px[i + 2] = noise ? Math.random() * 255 : 120
        px[i + 3] = 255
      }
    }
    return px
  })
}

Deno.test('size: longest side 480 px, even numbers', () => {
  assertEquals(gifSize(222, 480), { width: 222, height: 480 })
  assertEquals(gifSize(1080, 1920), { width: 270, height: 480 })
  assertEquals(gifSize(1920, 1080), { width: 480, height: 270 })
})

Deno.test('boomerang order: forward then backward, ends not repeated', () => {
  assertEquals(boomerangOrder(4), [0, 1, 2, 3, 2, 1])
  assertEquals(boomerangOrder(2), [0, 1])
})

Deno.test('3-second GIF: 30 frames, 10 per second, loops forever', async () => {
  const { bytes, frameCount, colors } = await makeGif(frames(30, 120, 200), 120, 200)
  const gif = readGif(bytes)
  assertEquals(gif.header, 'GIF89a')
  assertEquals([gif.width, gif.height], [120, 200])
  assertEquals(gif.images, 30)
  assertEquals(frameCount, 30)
  assert(gif.delays.every((d) => d === 10), `delays ${gif.delays}`) // 10 × 1/100 s
  assertEquals(gif.loop, 0) // 0 = forever
  assertEquals(colors, 256)
})

Deno.test('Boomerang: 20 frames play as 38 (forward + back)', async () => {
  const gif = readGif((await makeGif(frames(20, 60, 100), 60, 100, { boomerang: true })).bytes)
  assertEquals(gif.images, 38)
  assertEquals(gif.loop, 0)
})

Deno.test('too big: fewer colours and frames until it fits', async () => {
  const noisy = frames(20, 40, 40, true)
  const full = await makeGif(noisy, 40, 40, { maxBytes: 50 * 1024 * 1024 })
  const limit = Math.floor(full.bytes.length * 0.55)
  const small = await makeGif(noisy, 40, 40, { maxBytes: limit })
  assert(small.bytes.length <= limit, `${small.bytes.length} > ${limit}`)
  assertEquals(small.colors, 64)
  assertEquals(small.frameCount, 10)
  const gif = readGif(small.bytes)
  assert(gif.delays.every((d) => d === 20), 'half the frames, each shown twice as long')
})

Deno.test('still too big → plain-English error', async () => {
  await assertRejects(() => makeGif(frames(5, 50, 50, true), 50, 50, { maxBytes: 100 }), Error, 'This GIF is too big. Try a shorter one.')
})

Deno.test('no frames → asks to hold longer', async () => {
  await assertRejects(() => makeGif([], 10, 10), Error, 'Hold the button a little longer to make a GIF.')
})
