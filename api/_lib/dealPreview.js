// The small page WhatsApp, Instagram, X and Facebook read when someone shares
// a deal link (/d/<id>): title, photo and price in the preview card. People
// who open it are sent straight on to the deal in the app.
import { offerBadge, studentPrice } from '../../src/lib/dealPricing.js'
import { formatMoney } from '../../src/lib/format.js'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// Only photos from our own storage, or Unsplash (which the deal generator
// uses), are put in the preview.
export function safeImage(url, supabaseUrl) {
  if (typeof url !== 'string') return null
  if (supabaseUrl && url.startsWith(`${supabaseUrl}/storage/v1/object/public/`)) return url
  return url.startsWith('https://images.unsplash.com/') ? url : null
}

export function previewText(deal) {
  const price = studentPrice(deal)
  const badge = offerBadge(deal)
  const parts = [deal.business_name, price != null ? formatMoney(price) : null, badge].filter(Boolean)
  return `${parts.join(' · ')} — student deal on Unipicks`
}

// id: the shared deal. Without its details (switched off, not found, settings
// missing) the link still opens that deal in the app, just with no preview.
export function renderPreview({ deal, id, origin, supabaseUrl }) {
  const appPath = UUID.test(id || '') ? `/deal/${id}` : '/register'
  const appUrl = `${origin}${appPath}`
  const title = deal ? `${deal.title} — ${deal.business_name}` : 'Unipicks — student food deals'
  const text = deal ? previewText(deal) : 'Student food deals near campus.'
  const image = deal ? safeImage(deal.image_url, supabaseUrl) : null
  const e = escapeHtml
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<meta name="description" content="${e(text)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Unipicks">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(text)}">
<meta property="og:url" content="${e(appUrl)}">
${image ? `<meta property="og:image" content="${e(image)}">\n<meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<meta name="twitter:title" content="${e(title)}">
<meta name="twitter:description" content="${e(text)}">
<meta http-equiv="refresh" content="0; url=${e(appPath)}">
</head>
<body>
<p><a href="${e(appPath)}">Open ${e(deal ? deal.title : 'Unipicks')} on Unipicks</a></p>
</body>
</html>`
}
