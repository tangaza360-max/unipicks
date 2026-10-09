import { useEffect, useRef, useState } from 'react'
import { Link2, MessageCircle, Share2, X } from 'lucide-react'
import { dealShareLinks } from '../lib/shareCore.js'

// Share a deal. Phones open their own share menu (WhatsApp, Instagram,
// TikTok, …). Without one (most computers) a small panel offers WhatsApp,
// X, Facebook and Copy link. The link is /d/<id>, which has a preview card.
export async function shareDeal(deal, openPanel) {
  const { url, text } = dealShareLinks(deal, window.location.origin)
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: deal.title, text, url })
      return 'shared'
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled' // they closed the menu
      // Any other refusal: fall back to the panel.
    }
  }
  openPanel()
  return 'panel'
}

export function ShareButton({ deal, className = '', label = 'Share', children }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => shareDeal(deal, () => setOpen(true))} aria-label={children ? undefined : `${label} ${deal.title}`} className={className}>
        {children || <Share2 size={18} aria-hidden="true" />}
      </button>
      {open && <SharePanel deal={deal} onClose={() => setOpen(false)} />}
    </>
  )
}

export function SharePanel({ deal, onClose }) {
  const links = dealShareLinks(deal, window.location.origin)
  const [copied, setCopied] = useState('')
  const firstRef = useRef(null)

  useEffect(() => {
    firstRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function copy() {
    try {
      await navigator.clipboard.writeText(links.url)
      setCopied('Link copied. Paste it in a chat, a story or your bio.')
    } catch {
      setCopied(`Copy this link: ${links.url}`)
    }
  }

  const item = 'flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left font-medium hover:bg-muted'
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="share-title" className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-2xl">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="share-title" className="font-display text-lg font-semibold">Share this deal</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="mb-3 truncate text-sm text-muted-foreground">{deal.title}</p>
        <a ref={firstRef} href={links.whatsapp} target="_blank" rel="noopener noreferrer" className={item}>
          <MessageCircle size={20} aria-hidden="true" className="text-[#128C3E]" /> WhatsApp
        </a>
        <a href={links.x} target="_blank" rel="noopener noreferrer" className={item}>
          <span aria-hidden="true" className="w-5 text-center font-bold">𝕏</span> X (Twitter)
        </a>
        <a href={links.facebook} target="_blank" rel="noopener noreferrer" className={item}>
          <span aria-hidden="true" className="w-5 text-center font-bold text-[#1877F2]">f</span> Facebook
        </a>
        <button type="button" onClick={copy} className={item}>
          <Link2 size={20} aria-hidden="true" /> Copy link
        </button>
        <p className="mt-2 text-xs text-muted-foreground">Instagram and TikTok: copy the link and paste it in your story or bio.</p>
        <p role="status" className="mt-2 text-sm text-foreground">{copied}</p>
      </div>
    </div>
  )
}
