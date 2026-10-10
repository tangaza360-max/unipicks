// A WhatsApp number from settings becomes a wa.me chat link: the full number
// with its country code, no "+", spaces or leading 0
// (https://bird.com/explained/whatsapp/what-is-a-whatsapp-click-to-chat-link).
// Only a full Rwandan mobile number is accepted — 250 then 7 and 8 digits,
// written "+250 788 123 456", "250788123456" or "0788123456" — so a typo
// hides the button instead of opening a chat with a stranger.
export function whatsappNumber(raw) {
  const digits = String(raw ?? '').replace(/[\s()+-]/g, '')
  if (/^07\d{8}$/.test(digits)) return `250${digits.slice(1)}`
  if (/^2507\d{8}$/.test(digits)) return digits
  return null
}

export function whatsappLink(raw) {
  const number = whatsappNumber(raw)
  return number ? `https://wa.me/${number}` : null
}

// "+250 788 123 456"
export function formatWhatsapp(raw) {
  const n = whatsappNumber(raw)
  return n ? `+${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 9)} ${n.slice(9)}` : null
}
