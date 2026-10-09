// Sharing a deal: short link, text and the links for computers.
import { assertEquals } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS module from the web app
import { dealShareLinks, dealShareText, dealShareUrl } from '../../../src/lib/shareCore.js'

const deal = { id: '286bcf79-0ab4-49d4-851b-283aae1a3499', title: 'Burger Thursday', business_name: 'Mr. Chips & Co', offer_type: 'percentage', price: 6000, discount_percent: 20 }
const origin = 'https://unipicks.vercel.app'

Deno.test('share link is the short /d/ link (it has the preview card)', () => {
  assertEquals(dealShareUrl(deal, origin), `${origin}/d/${deal.id}`)
})

Deno.test('share text names the deal, the business and the student price', () => {
  assertEquals(dealShareText(deal), 'Burger Thursday at Mr. Chips & Co for 4,800 RWF on Unipicks')
  assertEquals(dealShareText({ ...deal, price: null, discount_percent: null, offer_type: 'percentage' }), 'Burger Thursday at Mr. Chips & Co on Unipicks')
})

Deno.test('links for computers are encoded (an & in a name does not break them)', () => {
  const l = dealShareLinks(deal, origin)
  assertEquals(l.whatsapp, `https://wa.me/?text=${encodeURIComponent(`${l.text} ${l.url}`)}`)
  assertEquals(new URL(l.x).searchParams.get('url'), l.url)
  assertEquals(new URL(l.x).searchParams.get('text'), l.text)
  assertEquals(new URL(l.facebook).searchParams.get('u'), l.url)
})
