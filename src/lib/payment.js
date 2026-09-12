import { supabase } from './supabaseClient.js'

function generateCode() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

export async function createRedemption({ dealId }) {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) throw new Error('Please sign in before starting a payment.')
  if (!dealId) throw new Error('Missing deal reference for this order.')

  const { data, error } = await supabase.from('redemptions').insert({
    deal_id: dealId,
    student_id: user.id,
    code: generateCode(),
    status: 'pending',
  }).select('id, code').single()

  if (error) throw error
  return data
}

export async function initiatePayment({ redemptionId, dealId, amount, phone, currency = 'RWF' }) {
  const { data, error } = await supabase.functions.invoke('process-payment', {
    body: {
      redemption_id: redemptionId,
      deal_id: dealId,
      amount,
      phone,
      currency,
    },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}
