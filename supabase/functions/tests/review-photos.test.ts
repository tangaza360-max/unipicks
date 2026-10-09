// Review photos keep their shape and are at most 1080 px.
import { assertEquals } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS module from the web app
import { fitWithin } from '../../../src/lib/reviewPhotosCore.js'

Deno.test('phone photos shrink to 1080 px on the long side, same shape', () => {
  assertEquals(fitWithin(3024, 4032), { width: 810, height: 1080 })
  assertEquals(fitWithin(4000, 3000), { width: 1080, height: 810 })
  assertEquals(fitWithin(4000, 4000), { width: 1080, height: 1080 })
})

Deno.test('small photos are not enlarged', () => {
  assertEquals(fitWithin(640, 480), { width: 640, height: 480 })
  assertEquals(fitWithin(1, 5000), { width: 1, height: 1080 })
})
