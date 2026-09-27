// supabase/functions/expire-orders/index.ts
//
// Purpose: automatically expire orders whose confirmation_deadline has passed.
// Called by an external cron service (e.g. cron-job.org) every minute.
//
// Logic:
//   1. Verify caller has the correct CRON_SECRET (or a valid service_role key).
//   2. Find all orders where status = 'pending_confirmation' AND
//      confirmation_deadline < now().
//   3. Update them to status = 'confirmation_expired'.
//   4. Return how many orders were expired.
//
// Safe to run repeatedly. If nothing is expired, it does nothing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-cron-secret',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  try {
    // --- Optional simple protection ---
    // If we set CRON_SECRET in Supabase secrets, callers must send it.
    // This stops random people from hitting the endpoint.
    const expectedSecret = Deno.env.get('CRON_SECRET')
    if (expectedSecret) {
      const providedSecret = req.headers.get('x-cron-secret')
      if (providedSecret !== expectedSecret) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // --- Supabase admin client ---
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const nowIso = new Date().toISOString()

    // --- Find expired pending orders ---
    const { data: expired, error: findError } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('status', 'pending_confirmation')
      .lt('confirmation_deadline', nowIso)

    if (findError) {
      console.error('Failed to find expired orders:', findError)
      return new Response(
        JSON.stringify({ error: 'Failed to query orders', details: findError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const expiredIds = (expired ?? []).map((o) => o.id)

    if (expiredIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, expired_count: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // --- Mark them as confirmation_expired ---
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ status: 'confirmation_expired' })
      .in('id', expiredIds)

    if (updateError) {
      console.error('Failed to update expired orders:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update orders', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log(`Expired ${expiredIds.length} order(s):`, expiredIds)

    return new Response(
      JSON.stringify({ success: true, expired_count: expiredIds.length, ids: expiredIds }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('Unexpected error in expire-orders:', error)
    return new Response(
      JSON.stringify({ error: 'Unexpected server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
