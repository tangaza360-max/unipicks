import { supabase } from './supabaseClient.js'

export async function createOrder({ dealId, quantity = 1 }) {
  if (!dealId) throw new Error('Missing deal reference for this order.')

  const { data, error } = await supabase.functions.invoke('create-order', {
    body: {
      deal_id: dealId,
      quantity,
    },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)

  return data.order
}
