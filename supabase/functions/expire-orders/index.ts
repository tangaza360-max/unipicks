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
//   3. group_orders still open past expires_at (24 hours) -> cancelled; the
//      notify_group_expired trigger tells the members.
//   4. student stories that ended 48 h+ ago with no open report: photo and
//      row deleted (student_stories_to_clean, at most 100 per run).
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

    const { data: closedGroups, error: groupError } = await supabaseAdmin
      .from('group_orders')
      .update({ status: 'cancelled' })
      .eq('status', 'open')
      .lt('expires_at', nowIso)
      .select('id')
    if (groupError) throw new Error(`group_orders open -> cancelled: ${groupError.message}`)
    const groupIds = (closedGroups ?? []).map((g: { id: string }) => g.id)

    // Ended student stories: photo first, then the row, so a failed photo
    // delete is simply retried next minute. Never stops the order rules.
    let storiesCleaned = 0
    try {
      const { data: toClean, error: listError } = await supabaseAdmin.rpc('student_stories_to_clean', { p_limit: 100 })
      if (listError) throw new Error(`list: ${listError.message}`)
      const stories = (toClean ?? []) as { id: string; media_url: string }[]
      if (stories.length) {
        const { error: fileError } = await supabaseAdmin.storage
          .from('student-stories')
          .remove(stories.map((s) => s.media_url))
        if (fileError) throw new Error(`photos: ${fileError.message}`)
        const { error: rowError } = await supabaseAdmin
          .from('student_stories')
          .delete()
          .in('id', stories.map((s) => s.id))
        if (rowError) throw new Error(`rows: ${rowError.message}`)
        storiesCleaned = stories.length
      }
    } catch (cleanError) {
      console.error('[expire-orders] story clean-up failed (will retry):', cleanError)
    }

    console.log(
      `[expire-orders] expired ${pendingIds.length} pending_confirmation, ${confirmedIds.length} confirmed, ${groupIds.length} groups; cleaned ${storiesCleaned} ended stories`,
      { confirmation_expired: pendingIds, payment_expired: confirmedIds, groups_closed: groupIds },
    )

    return json({
      success: true,
      expired_pending: pendingIds.length,
      expired_confirmed: confirmedIds.length,
      expired_groups: groupIds.length,
      stories_cleaned: storiesCleaned,
      // Kept for existing callers: total across both rules.
      expired_count: pendingIds.length + confirmedIds.length,
    })
  } catch (error) {
    console.error('[expire-orders] failed:', error)
    return json({ error: 'Failed to expire orders' }, 500)
  }
})
