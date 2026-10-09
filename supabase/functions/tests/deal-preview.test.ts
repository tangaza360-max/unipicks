// Link preview page for shared deals (/d/<id> → api/deal-preview.js).
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS modules from the Vercel function
import { escapeHtml, renderPreview, safeImage } from '../../../api/_lib/dealPreview.js'
// @ts-ignore: plain JS module from the Vercel function
import handler, { loadDeal } from '../../../api/deal-preview.js'

const SB = 'https://dylgephsnywowxxasifs.supabase.co'
const ID = '286bcf79-0ab4-49d4-851b-283aae1a3499'
const deal = {
  id: ID, title: 'Burger Thursday', business_name: 'Mr. Chips', offer_type: 'percentage', price: 6000, discount_percent: 20,
  image_url: `${SB}/storage/v1/object/public/deal-images/x/burger.jpg`,
}
const origin = 'https://unipicks.vercel.app'

Deno.test('preview has title, business, price, photo and opens the deal', () => {
  const html = renderPreview({ deal, id: ID, origin, supabaseUrl: SB })
  assertStringIncludes(html, '<meta property="og:title" content="Burger Thursday — Mr. Chips">')
  assertStringIncludes(html, 'Mr. Chips · 4,800 RWF · 20% OFF — student deal on Unipicks')
  assertStringIncludes(html, `<meta property="og:image" content="${deal.image_url}">`)
  assertStringIncludes(html, 'summary_large_image')
  assertStringIncludes(html, `<meta http-equiv="refresh" content="0; url=/deal/${ID}">`)
  assertStringIncludes(html, `<meta property="og:url" content="${origin}/deal/${ID}">`)
  assert(!html.includes('<script'), 'no scripts (CSP)')
})

Deno.test('text from businesses is escaped (no HTML injection)', () => {
  const html = renderPreview({ deal: { ...deal, title: '<script>alert(1)</script>"x', business_name: "O'Neil & Co" }, id: ID, origin, supabaseUrl: SB })
  assert(!html.includes('<script>alert'))
  assertStringIncludes(html, '&lt;script&gt;alert(1)&lt;/script&gt;&quot;x')
  assertStringIncludes(html, 'O&#39;Neil &amp; Co')
  assertEquals(escapeHtml('a<b>"c"&\''), 'a&lt;b&gt;&quot;c&quot;&amp;&#39;')
})

Deno.test('only photos from our own public storage or Unsplash go in the preview', () => {
  assertEquals(safeImage(deal.image_url, SB), deal.image_url)
  const unsplash = 'https://images.unsplash.com/photo-1563979026-05df925d8354?w=400'
  assertEquals(safeImage(unsplash, SB), unsplash)
  assertEquals(safeImage('https://images.unsplash.com.evil.com/x.jpg', SB), null)
  assertEquals(safeImage('http://images.unsplash.com/x.jpg', SB), null)
  assertEquals(safeImage('https://evil.com/x.jpg', SB), null)
  assertEquals(safeImage(`${SB}/storage/v1/object/sign/student-stories/a.jpg?token=t`, SB), null)
  const html = renderPreview({ deal: { ...deal, image_url: 'https://evil.com/x.jpg' }, id: ID, origin, supabaseUrl: SB })
  assert(!html.includes('og:image'))
})

Deno.test('no deal details: the link still opens that deal; a bad id opens sign up', () => {
  assertStringIncludes(renderPreview({ deal: null, id: ID, origin, supabaseUrl: SB }), `url=/deal/${ID}`)
  assertStringIncludes(renderPreview({ deal: null, id: '../../etc', origin, supabaseUrl: SB }), 'url=/register')
})

Deno.test('loadDeal asks only for a live deal, with the public key; failures give no preview', async () => {
  const calls: Array<{ url: string; headers: Record<string, string> }> = []
  // deno-lint-ignore no-explicit-any
  const ok = (body: unknown): any => (url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers })
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
  }
  assertEquals(await loadDeal(ID, SB, 'anon', ok([deal])), deal)
  assertStringIncludes(calls[0].url, `${SB}/rest/v1/deals?id=eq.${ID}&active=eq.true&select=`)
  assertEquals(calls[0].headers.apikey, 'anon')
  assertEquals(await loadDeal('not-an-id', SB, 'anon', ok([deal])), null)
  assertEquals(calls.length, 1, 'bad id: no request at all')
  assertEquals(await loadDeal(ID, undefined, undefined, ok([deal])), null)
  assertEquals(await loadDeal(ID, SB, 'anon', () => Promise.resolve(new Response('no', { status: 500 }))), null)
  assertEquals(await loadDeal(ID, SB, 'anon', () => Promise.reject(new Error('down'))), null)
  assertEquals(await loadDeal(ID, SB, 'anon', ok([])), null)
})

Deno.test('handler without settings still answers 200 and opens the deal (no cache)', async () => {
  const sent: { status?: number; body?: string; headers: Record<string, string> } = { headers: {} }
  const res = {
    setHeader: (k: string, v: string) => { sent.headers[k] = v },
    status(code: number) { sent.status = code; return this },
    send(body: string) { sent.body = body },
  }
  await handler({ query: { id: ID }, headers: { host: 'unipicks.vercel.app' } }, res)
  assertEquals(sent.status, 200)
  assertEquals(sent.headers['Content-Type'], 'text/html; charset=utf-8')
  assertEquals(sent.headers['Cache-Control'], 'no-store')
  assertStringIncludes(sent.body!, `url=/deal/${ID}`)
})
