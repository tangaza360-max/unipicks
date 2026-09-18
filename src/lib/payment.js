import { supabase } from './supabaseClient.js'

export async function initiatePayment({ orderId, phone }) {
  if (!orderId) throw new Error('Missing order reference for this payment.')
  if (!phone) throw new Error('Missing phone number for this payment.')

  const { data, error } = await supabase.functions.invoke('process-payment', {
    body: {
      order_id: orderId,
      phone,
    },
  })

  if (error) {
    if (error.name === 'FunctionsHttpError' && error.context) {
      let responseBody = ''

      try {
        responseBody = await error.context.text()
      } catch {
        responseBody = ''
      }

      throw new Error(
        `Payment request failed (${error.context.status}): ${responseBody || error.message}`,
      )
    }

    throw error
  }

  if (data?.error) throw new Error(data.error)

  return data
}
