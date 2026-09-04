import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const expectedSecret = Deno.env.get('PAYPACK_WEBHOOK_SECRET')
  if (expectedSecret && request.headers.get('x-paypack-webhook-secret') !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401)
  }

  try {
    const payload = await request.json()
    const reference = String(payload.reference ?? payload.metadata?.reference ?? '')
    const providerStatus = String(payload.status ?? '').toLowerCase()
    const status = providerStatus === 'success' || providerStatus === 'successful'
      ? 'success'
      : providerStatus === 'cancelled' || providerStatus === 'canceled'
        ? 'cancelled'
        : providerStatus === 'failed' ? 'failed' : 'pending'

    if (!reference) return json({ error: 'Missing payment reference' }, 400)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { error } = await serviceClient
      .from('transactions')
      .update({ status, provider_response: payload })
      .eq('reference', reference)

    if (error) throw error
    return json({ ok: true })
  } catch (error) {
    console.error('[payment-webhook]', error)
    return json({ error: error instanceof Error ? error.message : 'Unexpected webhook error' }, 500)
  }
})
