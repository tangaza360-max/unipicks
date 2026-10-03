import { supabase } from './supabaseClient.js'

export async function createOrder({ dealId, quantity = 1 }) {
  if (!dealId) throw new Error('Missing deal reference for this order.')

  const { data, error } = await supabase.functions.invoke('create-order', {
    body: {
      deal_id: dealId,
      quantity,
    },
  })

  if (error) {
    // Show the function's own message (e.g. "Only verified students can order…")
    // instead of the generic "non-2xx status code".
    let message = error.message
    if (error.context && typeof error.context.json === 'function') {
      try {
        const body = await error.context.json()
        if (body?.error) message = body.error
      } catch {
        // keep the generic message
      }
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)

  return data.order
}
