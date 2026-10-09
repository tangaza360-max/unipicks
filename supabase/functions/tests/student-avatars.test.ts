// Profile picture helpers: centred square crop and accepted files.
import { assertEquals } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS module from the web app
import { avatarCropRect, avatarFileProblem } from '../../../src/lib/studentAvatarsCore.js'

Deno.test('centred square crop for tall, wide and square photos', () => {
  assertEquals(avatarCropRect(3024, 4032), { sx: 0, sy: 504, size: 3024 })
  assertEquals(avatarCropRect(4000, 3000), { sx: 500, sy: 0, size: 3000 })
  assertEquals(avatarCropRect(512, 512), { sx: 0, sy: 0, size: 512 })
})

Deno.test('photos accepted; other files and huge ones refused with plain words', () => {
  const f = (type: string, size = 1000) => ({ type, size })
  assertEquals(avatarFileProblem(f('image/jpeg')), '')
  assertEquals(avatarFileProblem(f('image/png')), '')
  assertEquals(avatarFileProblem(f('image/heic')), '')
  assertEquals(avatarFileProblem(f('image/gif')), 'Choose a photo (JPG, PNG or WebP).')
  assertEquals(avatarFileProblem(f('video/mp4')), 'Choose a photo (JPG, PNG or WebP).')
  assertEquals(avatarFileProblem(f('image/jpeg', 16 * 1024 * 1024)), 'This photo is too big. Choose one under 15 MB.')
  assertEquals(avatarFileProblem(null), 'Choose a photo.')
})
