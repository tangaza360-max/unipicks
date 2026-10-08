// Leaked-password check (k-anonymity): only the first 5 hash characters are
// sent; a password found in the answer is refused; an outage never blocks.
import { assertEquals } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS module from the web app
import { PWNED_RANGE_URL, countInRange, sha1Parts, timesPwned } from '../../../src/lib/pwnedPassword.js'

Deno.test('SHA-1 split: 5-character prefix and 35-character suffix', async () => {
  // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8 (well-known test value)
  assertEquals(await sha1Parts('password'), ['5BAA6', '1E4C9B93F3F0682250B6CF8331B7EE68FD8'])
})

Deno.test('reads the count for our suffix; padding lines count 0', () => {
  const body = '003D68EB55068C33ACE09247EE4C639306B:3\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9659365\r\nFFFFF00000000000000000000000000000000:0'
  assertEquals(countInRange(body, '1E4C9B93F3F0682250B6CF8331B7EE68FD8'), 9659365)
  assertEquals(countInRange(body, 'FFFFF00000000000000000000000000000000'), 0)
  assertEquals(countInRange(body, 'AAAA'), 0)
})

Deno.test('only the hash prefix is sent, with padding; never the password', async () => {
  const calls: { url: string; headers: Record<string, string> }[] = []
  const fetchImpl = ((url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers })
    return Promise.resolve(new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:12\r\n'))
  }) as unknown as typeof fetch
  assertEquals(await timesPwned('password', { fetchImpl }), 12)
  assertEquals(calls[0].url, PWNED_RANGE_URL + '5BAA6')
  assertEquals(calls[0].headers['Add-Padding'], 'true')
  assertEquals(calls[0].url.slice(PWNED_RANGE_URL.length), '5BAA6', 'nothing but the 5-character prefix')
})

Deno.test('a safe password counts 0; an outage gives null (sign-up not blocked)', async () => {
  const ok = (() => Promise.resolve(new Response('0000000000000000000000000000000000A:1\r\n'))) as typeof fetch
  assertEquals(await timesPwned('a-long-unique-Unipicks-pass-2026!', { fetchImpl: ok }), 0)
  assertEquals(await timesPwned('x', { fetchImpl: (() => Promise.reject(new TypeError('offline'))) as typeof fetch }), null)
  assertEquals(await timesPwned('x', { fetchImpl: (() => Promise.resolve(new Response('', { status: 503 }))) as typeof fetch }), null)
})
