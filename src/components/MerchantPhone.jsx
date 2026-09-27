import { useState } from 'react'

export default function MerchantPhone({ phone }) {
  const [copied, setCopied] = useState(false)

  if (!phone) return null

  const cleaned = phone.replace(/\s/g, '')
  const telHref = `tel:${cleaned}`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(cleaned)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <span className="text-muted-foreground">Merchant contact:</span>
      <a
        href={telHref}
        className="font-mono text-accent underline underline-offset-2 hover:opacity-80 transition"
        aria-label={`Call merchant at ${phone}`}
      >
        {phone}
      </a>
      <button
        type="button"
        onClick={handleCopy}
        className="text-xs border border-border text-muted-foreground hover:text-foreground rounded-md px-2 py-1 transition"
        aria-label="Copy phone number"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  )
}
