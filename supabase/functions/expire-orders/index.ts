// supabase/functions/expire-orders/index.ts
//
// Purpose: automatically expire orders whose deadline has passed.
// Called by an external cron service (e.g. cron-job.org) every minute.
//
// Rules:
//   1. pending_confirmation past confirmation_deadline -> confirmation_expired
//      (the merchant never answered).
//   2. confirmed past payment_deadline -> payment_expired
//      (the student never paid; payment_deadline is set when the merchant accepts).
//
// Each rule is one conditional UPDATE (status + deadline in the WHERE clause), so
// an order that moves on between runs, e.g. accepted or paid a moment before,
// is never overwritten. Safe to run repeatedly: a second run finds nothing.
// payment_processing orders are left alone: a payment is in flight and the
// webhook / process-payment decide them.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-cron-secret',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type ExpiryRule = {
  from: 'pending_confirmation' | 'confirmed'
  deadlineColumn: 'confirmation_deadline' | 'payment_deadline'
  to: 'confirmation_expired' | 'payment_expired'
}

const RULES: ExpiryRule[] = [
  { from: 'pending_confirmation', deadlineColumn: 'confirmation_deadline', to: 'confirmation_expired' },
  { from: 'confirmed', deadlineColumn: 'payment_deadline', to: 'payment_expired' },
]

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    // --- Optional simple protection ---
    // If we set CRON_SECRET in Supabase secrets, callers must send it.
    // This stops random people from hitting the endpoint.
    const expectedSecret = Deno.env.get('CRON_SECRET')
    if (expectedSecret) {
      const providedSecret = req.headers.get('x-cron-secret')
      if (providedSecret !== expectedSecret) {
        return json({ error: 'Unauthorized' }, 401)
      }
    }

    // --- Supabase admin client ---
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const nowIso = new Date().toISOString()

    async function expire(rule: ExpiryRule): Promise<string[]> {
      // lt() never matches a NULL deadline, so orders without one are skipped.
      const { data, error } = await supabaseAdmin
        .from('orders')
        .update({ status: rule.to, updated_at: nowIso })
        .eq('status', rule.from)
        .lt(rule.deadlineColumn, nowIso)
        .select('id')

      if (error) {
        throw new Error(`${rule.from} -> ${rule.to}: ${error.message}`)
      }
      return (data ?? []).map((o: { id: string }) => o.id)
    }

    const [pendingIds, confirmedIds] = [await expire(RULES[0]), await expire(RULES[1])]

    console.log(
      `[expire-orders] expired ${pendingIds.length} pending_confirmation, ${confirmedIds.length} confirmed`,
      { confirmation_expired: pendingIds, payment_expired: confirmedIds },
    )

    return json({
      success: true,
      expired_pending: pendingIds.length,
      expired_confirmed: confirmedIds.length,
      // Kept for existing callers: total across both rules.
      expired_count: pendingIds.length + confirmedIds.length,
    })
  } catch (error) {
    console.error('[expire-orders] failed:', error)
    return json({ error: 'Failed to expire orders' }, 500)
  }
})
