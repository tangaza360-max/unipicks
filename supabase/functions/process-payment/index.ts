import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function validRwandanPhone(phone: string) {
  return /^(078|079|072|073)\d{7}$/.test(phone)
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405)

  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization) return response({ error: 'Authentication required' }, 401)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } },
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return response({ error: 'Invalid authentication token' }, 401)

    const body = await request.json()
    const amount = Number(body.amount)
    const phoneNumber = String(body.phone_number ?? '').replace(/\s+/g, '')
    const transactionId = String(body.transaction_id ?? '')
    const reference = String(body.reference ?? '')
    const description = String(body.description ?? 'Unipicks payment')

    if (!Number.isInteger(amount) || amount <= 0 || !validRwandanPhone(phoneNumber) || !transactionId || !reference) {
      return response({ error: 'Valid amount, Rwandan phone number, transaction_id, and reference are required' }, 400)
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: transaction, error: transactionError } = await serviceClient
      .from('transactions')
      .select('id, student_id, amount, phone_number, reference, status')
      .eq('id', transactionId)
      .eq('student_id', user.id)
      .eq('reference', reference)
      .single()

    if (transactionError || !transaction || transaction.status !== 'pending' || transaction.amount !== amount) {
      return response({ error: 'Pending transaction was not found or is invalid' }, 400)
    }

    const baseUrl = (Deno.env.get('PAYPACK_BASE_URL') ?? 'https://api.paypack.io/sandbox').replace(/\/$/, '')
    const paypackResponse = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('PAYPACK_PUBLIC_KEY') ?? ''}`,
        'x-api-key': Deno.env.get('PAYPACK_SECRET_KEY') ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount, phone_number: phoneNumber, reference, description }),
    })

    const providerBody = await paypackResponse.json().catch(() => ({}))
    const providerStatus = paypackResponse.ok ? 'pending' : 'failed'
    await serviceClient.from('transactions').update({
      status: providerStatus,
      phone_number: phoneNumber,
      provider_response: providerBody,
    }).eq('id', transaction.id)

    if (!paypackResponse.ok) {
      return response({ error: providerBody?.message ?? `Paypack request failed (${paypackResponse.status})`, provider_response: providerBody }, 502)
    }

    return response({
      transaction_id: providerBody.transaction_id ?? providerBody.id ?? transaction.id,
      status: providerBody.status ?? 'pending',
      payment_url: providerBody.payment_url ?? null,
      reference,
    })
  } catch (error) {
    console.error('[process-payment]', error)
    return response({ error: error instanceof Error ? error.message : 'Unexpected payment error' }, 500)
  }
})
