// Sharing a deal: the short link (with its preview card) and the text, plus
// links for computers that have no share menu. Pure, so it can be tested.
import { studentPrice } from './dealPricing.js'
import { formatMoney } from './format.js'

export function dealShareUrl(deal, origin) {
  return `${origin}/d/${deal.id}`
}

export function dealShareText(deal) {
  const price = studentPrice(deal)
  return `${deal.title} at ${deal.business_name}${price != null ? ` for ${formatMoney(price)}` : ''} on Unipicks`
}

export function dealShareLinks(deal, origin) {
  const url = dealShareUrl(deal, origin)
  const text = dealShareText(deal)
  const e = encodeURIComponent
  return {
    url,
    text,
    whatsapp: `https://wa.me/?text=${e(`${text} ${url}`)}`,
    x: `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`,
  }
}
