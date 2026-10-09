// GET /d/<deal id> (vercel.json rewrite) → preview page for link previews.
// Reads only a live deal with the public app key, under the same rules as
// any visitor (RLS: live deals of approved businesses).
import { UUID, renderPreview } from './_lib/dealPreview.js'

const COLUMNS = 'id,title,business_name,image_url,price,final_price,discount_percent,discount_value,offer_type,buy_quantity,get_quantity,min_participants'

export async function loadDeal(id, supabaseUrl, anonKey, fetchImpl = fetch) {
  if (!UUID.test(id) || !supabaseUrl || !anonKey) return null
  try {
    const reply = await fetchImpl(`${supabaseUrl}/rest/v1/deals?id=eq.${id}&active=eq.true&select=${COLUMNS}&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    })
    return reply.ok ? (await reply.json())[0] || null : null
  } catch {
    return null // no preview; the link still opens the app
  }
}

export default async function handler(req, res) {
  const id = String(req.query?.id || '')
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host || 'unipicks.vercel.app'}`
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const deal = await loadDeal(id, supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY)

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', deal ? 'public, s-maxage=300, stale-while-revalidate=600' : 'no-store')
  res.status(200).send(renderPreview({ deal, id, origin, supabaseUrl }))
}
