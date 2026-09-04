import { supabase } from './supabaseClient.js'

export async function createPendingTransaction({ amount, dealId = null, orderId = null, description }) {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) throw new Error('Please sign in before starting a payment.')

  const reference = `unipicks-${crypto.randomUUID()}`
  const { data, error } = await supabase.from('transactions').insert({
    student_id: user.id,
    deal_id: dealId,
    order_id: orderId,
    amount: Math.round(Number(amount)),
    phone_number: '',
    reference,
    status: 'pending',
    provider_response: { description },
  }).select('id, reference').single()

  if (error) throw error
  return data
}

export async function initiatePayment({ transactionId, amount, phoneNumber, reference, description }) {
  const { data, error } = await supabase.functions.invoke('process-payment', {
    body: {
      transaction_id: transactionId,
      amount,
      phone_number: phoneNumber,
      reference,
      description,
    },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}
