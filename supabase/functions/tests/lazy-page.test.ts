// After a deploy a missing screen file triggers one reload, never a loop.
import { assertEquals } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS module from the web app
import { reloadOnceForNewVersion } from '../../../src/lib/lazyPage.js'

function memoryStorage() {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) } as unknown as Storage
}

Deno.test('first failure reloads; a second one within 10 s does not', () => {
  const storage = memoryStorage(); let reloads = 0; const reload = () => void reloads++
  assertEquals(reloadOnceForNewVersion(storage, reload, 1_000_000), true)
  assertEquals(reloadOnceForNewVersion(storage, reload, 1_005_000), false)
  assertEquals(reloads, 1)
  assertEquals(reloadOnceForNewVersion(storage, reload, 1_020_000), true, 'a later deploy can reload again')
  assertEquals(reloads, 2)
})

Deno.test('no storage (private mode): never reloads, so never loops', () => {
  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => {} } as unknown as Storage
  let reloads = 0
  assertEquals(reloadOnceForNewVersion(broken, () => void reloads++, 1), false)
  assertEquals(reloads, 0)
})
