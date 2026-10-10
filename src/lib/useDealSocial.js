import { useState } from 'react'
import { supabase } from './supabaseClient.js'
import { haptic } from './haptics.js'

// ❤️ like and 🔖 save, shared by the home feed and the deal page: change the
// screen at once, then save; put it back (and say so) if the database refuses.
// social: deal id → { like_count, liked_by_me, saved_by_me, friend_like_count,
// friend_name, comment_count } from get_deals_social.
export function useDealSocial() {
  const [social, setSocial] = useState({})
  const [busy, setBusy] = useState(() => new Set())
  const [notice, setNotice] = useState('')

  async function toggle(deal, kind) {
    if (busy.has(deal.id)) return
    const before = social[deal.id] || { like_count: 0, liked_by_me: false, saved_by_me: false }
    const on = kind === 'like' ? !before.liked_by_me : !before.saved_by_me
    const after =
      kind === 'like'
        ? { ...before, liked_by_me: on, like_count: Math.max(0, Number(before.like_count || 0) + (on ? 1 : -1)) }
        : { ...before, saved_by_me: on }
    setSocial((current) => ({ ...current, [deal.id]: after }))
    setBusy((current) => new Set(current).add(deal.id))
    setNotice('')
    if (on) haptic(12)

    const { data: { user } } = await supabase.auth.getUser()
    let result
    if (kind === 'like') {
      result = on
        ? await supabase.from('deal_likes').insert({ student_id: user?.id, deal_id: deal.id })
        : await supabase.from('deal_likes').delete().eq('student_id', user?.id).eq('deal_id', deal.id)
    } else {
      result = on
        ? await supabase.from('student_saved_items').insert({ student_id: user?.id, item_type: 'deal', item_id: deal.id })
        : await supabase.from('student_saved_items').delete().eq('student_id', user?.id).eq('item_type', 'deal').eq('item_id', deal.id)
    }

    setBusy((current) => {
      const next = new Set(current)
      next.delete(deal.id)
      return next
    })
    // Already liked / saved on another phone: the screen is right as it is.
    if (result.error && result.error.code !== '23505') {
      console.warn(`Could not ${kind} the deal:`, result.error.message)
      setSocial((current) => ({ ...current, [deal.id]: before }))
      setNotice(kind === 'like' ? "Your like wasn't saved. Please try again." : "That wasn't saved. Please try again.")
    } else if (kind === 'save') {
      setNotice(on ? `Saved: ${deal.title}` : `Removed from saved: ${deal.title}`)
    }
  }

  return { social, setSocial, busy, notice, toggle }
}
