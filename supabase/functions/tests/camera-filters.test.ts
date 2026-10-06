// Camera filters: one colour matrix drives both the live preview (SVG) and
// the saved pixels, so the photo looks like the preview.
import { assert, assertEquals } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS module from the web app
import { FILTERS, applyFilter, nextFilterIndex, svgMatrixValues } from '../../../src/lib/cameraFilters.js'

const byId = (id: string) => FILTERS.find((f: { id: string }) => f.id === id)!
const px = (...rgba: number[]) => new Uint8ClampedArray(rgba)

Deno.test('5 filters in the agreed order', () => {
  assertEquals(FILTERS.map((f: { label: string }) => f.label), ['Original', 'Warm', 'Cool', 'B&W', 'Bright'])
})

Deno.test('Original changes nothing', () => {
  const data = px(10, 20, 30, 255)
  applyFilter(data, byId('original').matrix)
  assertEquals([...data], [10, 20, 30, 255])
})

Deno.test('B&W: red, green and blue become equal (grey)', () => {
  const data = px(200, 100, 50, 255, 0, 255, 0, 128)
  applyFilter(data, byId('bw').matrix)
  assertEquals(data[0], data[1])
  assertEquals(data[1], data[2])
  assertEquals(data[4], data[5])
  assertEquals(data[7], 128, 'alpha unchanged')
})

Deno.test('Warm adds red and removes blue; Cool does the opposite', () => {
  const warm = applyFilter(px(100, 100, 100, 255), byId('warm').matrix)
  assert(warm[0] > 100 && warm[2] < 100, `warm ${[...warm]}`)
  const cool = applyFilter(px(100, 100, 100, 255), byId('cool').matrix)
  assert(cool[0] < 100 && cool[2] > 100, `cool ${[...cool]}`)
})

Deno.test('Bright makes every channel lighter and never goes past 255', () => {
  const data = applyFilter(px(100, 150, 250, 255), byId('bright').matrix)
  assert(data[0] > 100 && data[1] > 150)
  assertEquals(data[2], 255)
})

Deno.test('preview (SVG) uses the same numbers as the pixels', () => {
  assertEquals(svgMatrixValues(null), '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0')
  assertEquals(
    svgMatrixValues(byId('bright').matrix),
    '1.12 0 0 0 0.054902  0 1.12 0 0 0.054902  0 0 1.12 0 0.054902  0 0 0 1 0',
  )
})

Deno.test('swipe / button cycles through the filters both ways', () => {
  assertEquals(nextFilterIndex(0), 1)
  assertEquals(nextFilterIndex(4), 0)
  assertEquals(nextFilterIndex(0, -1), 4)
})
