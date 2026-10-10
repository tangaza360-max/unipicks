// The Help page's WhatsApp button: only a full Rwandan mobile number.
import { assertEquals } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS module from the web app
import { formatWhatsapp, whatsappLink, whatsappNumber } from '../../../src/lib/whatsapp.js'

Deno.test('the usual ways of writing a Rwandan number all work', () => {
  for (const raw of ['0788123456', '0788 123 456', '+250788123456', '+250 788 123 456', '250788123456', '(+250) 788-123-456']) {
    assertEquals(whatsappNumber(raw), '250788123456', raw)
    assertEquals(whatsappLink(raw), 'https://wa.me/250788123456', raw)
  }
  assertEquals(formatWhatsapp('0788123456'), '+250 788 123 456')
})

Deno.test('empty or wrong numbers give no button', () => {
  for (const raw of [undefined, null, '', ' ', '078812345', '07881234567', '0288123456', '+1 555 123 4567',
    '250288123456', 'abc', '0788123456?text=hi', 'https://wa.me/250788123456', '+250788123456/evil']) {
    assertEquals(whatsappLink(raw), null, String(raw))
    assertEquals(formatWhatsapp(raw), null, String(raw))
  }
})
