// supabase/functions/reconcile-payments/index.ts
//
// Safety net for asynchronous UmunotaPay payments. A payment the provider
// accepted but had not finished leaves the order in 'payment_processing' and
// the transaction in 'processing' until payment-webhook delivers the result.
// If that webhook never arrives (our endpoint down, a 500 past the provider's
// retry window), this function asks UmunotaPay for the payment's status.
//
// Called by cron (cron-job.org) every 5 minutes with the x-cron-secret header.
// Ships disabled: set RECONCILE_ENABLED=true once the status endpoint is known.
//
// Per run, up to BATCH_SIZE orders that are 'payment_processing', untouched
// for 5+ minutes and have a 'processing' transaction:
//   provider paid    -> transaction paid, order paid, pickup code + merchant notification
//   provider failed  -> transaction failed, order back to confirmed (student can
//                       retry, as in process-payment), student notification
//   provider pending -> nothing, unless the payment is 24h+ old: then
//                       transaction failed, order payment_expired (abandoned)
//   call failed / unreadable response -> order untouched, counted as errored
// Every write is guarded by the current status, so a run that races
// payment-webhook (or a second run) never repeats an action. Safe to re-run.
//
// Env (read per invocation, so secrets can change without a redeploy):
//   RECONCILE_ENABLED          "true" to run; anything else → { skipped: true }
//   UMUNOTA_STATUS_ENDPOINT    URL template with {ref}, e.g.
//                              https://api.umunotapay.com/api/v1/payments/{ref}
//   UMUNOTA_STATUS_METHOD      GET (default) or POST
//   UMUNOTA_STATUS_AUTH_STYLE  hmac (default, same scheme as process-payment),
//                              apikey (X-API-Key only) or bearer
//   UMUNOTA_API_KEY            existing secret
//   UMUNOTA_WEBHOOK_SECRET     existing secret; the HMAC key (as in process-payment)
//   CRON_SECRET                existing secret; required x-cron-secret header

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { sendPickupCodeMessage } from '../_shared/pickup-code-message.ts'

const BATCH_SIZE = 20
const STALE_AFTER_MS = 5 * 60 * 1000
const ABANDON_AFTER_MS = 24 * 60 * 60 * 1000
// Candidates fetched per run before keeping those with a 'processing'
// transaction, so orders without one can't starve the batch.
const CANDIDATE_LIMIT = 100

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

type Order = {
  id: string
  student_id: string
  merchant_id: string
  deal_id: string
  status: string
  merchant_phone: string | null
  created_at: string | null
  updated_at: string | null
}

type Transaction = {
  id: string
  normal_order_id: string
  status: string
  umunota_reference: string | null
  merchant_reference: string | null
  created_at: string | null
}

type ProviderStatus = 'paid' | 'failed' | 'pending'

const PAID = ['paid', 'success', 'successful', 'succeeded', 'completed', 'complete', 'approved']
const FAILED = ['failed', 'failure', 'cancelled', 'canceled', 'declined', 'rejected', 'expired', 'timeout', 'timed_out']
const PENDING = ['pending', 'processing', 'initiated', 'accepted', 'queued', 'in_progress', 'submitted']

export function normalizeProviderStatus(body: unknown): ProviderStatus | null {
  if (!body || typeof body !== 'object') return null
  const top = body as Record<string, unknown>
  const data = (top.data && typeof top.data === 'object' ? top.data : {}) as Record<string, unknown>
  const raw = [top.status, data.status, top.payment_status, data.payment_status]
    .find((v) => typeof v === 'string' && v.trim())
  if (typeof raw !== 'string') return null
  const value = raw.trim().toLowerCase()
  if (PAID.includes(value)) return 'paid'
  if (FAILED.includes(value)) return 'failed'
  if (PENDING.includes(value)) return 'pending'
  return null
}

async function hmacHex(secret: string, message: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

type StatusConfig = { endpoint: string; method: 'GET' | 'POST'; authStyle: 'hmac' | 'apikey' | 'bearer' }

// Returns the provider's raw status string and normalized value, or throws.
async function queryProvider(config: StatusConfig, ref: string) {
  const apiKey = Deno.env.get('UMUNOTA_API_KEY') ?? ''
  const url = new URL(config.endpoint.replaceAll('{ref}', encodeURIComponent(ref)))
  const body = config.method === 'POST' ? '{}' : ''
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (config.method === 'POST') headers['Content-Type'] = 'application/json'

  if (config.authStyle === 'bearer') {
    headers.Authorization = `Bearer ${apiKey}`
  } else {
    headers['X-API-Key'] = apiKey
  }
  if (config.authStyle === 'hmac') {
    // Same signing message as process-payment's collect call.
    const secret = Deno.env.get('UMUNOTA_WEBHOOK_SECRET') ?? ''
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const nonce = crypto.randomUUID()
    headers['X-Timestamp'] = timestamp
    headers['X-Nonce'] = nonce
    headers['X-Signature'] = secret
      ? await hmacHex(secret, `${config.method}\n${url.pathname}${url.search}\n${body}\n${timestamp}\n${nonce}`)
      : ''
  }

  const response = await fetch(url, { method: config.method, headers, body: body || undefined })
  const text = await response.text()
  if (!response.ok) throw new Error(`provider HTTP ${response.status}`)

  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    throw new Error('provider response is not JSON')
  }
  const status = normalizeProviderStatus(parsed)
  if (!status) throw new Error('provider response has no recognised status')
  return { status, payload: parsed as Record<string, unknown> }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const expectedSecret = Deno.env.get('CRON_SECRET')
  if (expectedSecret && req.headers.get('x-cron-secret') !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401)
  }

  if (Deno.env.get('RECONCILE_ENABLED') !== 'true') {
    return json({ skipped: true, reason: 'reconcile disabled' })
  }

  const endpoint = Deno.env.get('UMUNOTA_STATUS_ENDPOINT') ?? ''
  if (!endpoint.includes('{ref}')) {
    console.error('[reconcile-payments] UMUNOTA_STATUS_ENDPOINT is missing or has no {ref} placeholder')
    return json({ error: 'Reconciliation is not configured' }, 500)
  }
  const method = (Deno.env.get('UMUNOTA_STATUS_METHOD') ?? 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET'
  const authRaw = (Deno.env.get('UMUNOTA_STATUS_AUTH_STYLE') ?? 'hmac').toLowerCase()
  const authStyle = authRaw === 'apikey' || authRaw === 'bearer' ? authRaw : 'hmac'
  const config: StatusConfig = { endpoint, method, authStyle }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const counts = { checked: 0, confirmed: 0, failed: 0, still_pending: 0, abandoned: 0, errored: 0 }
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const staleBefore = new Date(now - STALE_AFTER_MS).toISOString()

  try {
    const { data: candidates, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id, student_id, merchant_id, deal_id, status, merchant_phone, created_at, updated_at')
      .eq('status', 'payment_processing')
      .lt('updated_at', staleBefore)
      .order('updated_at', { ascending: true })
      .limit(CANDIDATE_LIMIT)
    if (ordersError) throw new Error(`orders query: ${ordersError.message}`)

    const orders = (candidates ?? []) as Order[]
    if (orders.length === 0) {
      console.log('[reconcile-payments] checked=0 confirmed=0 failed=0 pending=0 abandoned=0 errored=0')
      return json({ success: true, ...counts })
    }

    const { data: txRows, error: txError } = await supabaseAdmin
      .from('transactions')
      .select('id, normal_order_id, status, umunota_reference, merchant_reference, created_at')
      .in('normal_order_id', orders.map((o) => o.id))
      .eq('status', 'processing')
    if (txError) throw new Error(`transactions query: ${txError.message}`)

    const txByOrder = new Map<string, Transaction>()
    for (const tx of (txRows ?? []) as Transaction[]) txByOrder.set(tx.normal_order_id, tx)

    const batch = orders.filter((o) => txByOrder.has(o.id)).slice(0, BATCH_SIZE)

    for (const order of batch) {
      const tx = txByOrder.get(order.id)!
      counts.checked += 1
      const logAction = (providerStatus: string, action: string) =>
        console.log(`[reconcile-payments] order=${order.id} tx=${tx.id} provider_status=${providerStatus} action=${action}`)

      const ref = tx.umunota_reference ?? tx.merchant_reference
      if (!ref) {
        counts.errored += 1
        logAction('none', 'errored:no_reference')
        continue
      }

      let result: Awaited<ReturnType<typeof queryProvider>>
      try {
        result = await queryProvider(config, ref)
      } catch (error) {
        counts.errored += 1
        logAction('unavailable', `errored:${error instanceof Error ? error.message : 'unknown'}`)
        continue
      }

      try {
        if (result.status === 'paid') {
          // Redemption before any status change (process-payment also creates
          // it before charging), so the only step after the order is paid is
          // the chat message, which is idempotent and re-sent by
          // process-payment's "already paid" path when the student opens it.
          const redemption = await ensureRedemption(supabaseAdmin, order)

          // Order first: it is the guard. Zero rows means another path
          // (payment-webhook, a parallel run) already moved it.
          const { data: paidOrders, error: orderError } = await supabaseAdmin
            .from('orders')
            .update({ status: 'paid', updated_at: nowIso })
            .eq('id', order.id)
            .eq('status', 'payment_processing')
            .select('id')
          if (orderError) throw new Error(`order update: ${orderError.message}`)

          const { error: txUpdateError } = await supabaseAdmin
            .from('transactions')
            .update({ status: 'paid', webhook_payload: result.payload, updated_at: nowIso })
            .eq('id', tx.id)
            .eq('status', 'processing')
          if (txUpdateError) throw new Error(`transaction update: ${txUpdateError.message}`)

          if (!paidOrders || paidOrders.length === 0) {
            logAction('paid', 'skipped:order_already_moved')
            continue
          }

          try {
            await sendPickupCodeMessage(supabaseAdmin, order, redemption.code)
          } catch (messageError) {
            console.error(`[reconcile-payments] order=${order.id} paid but pickup message failed: ${
              messageError instanceof Error ? messageError.message : (messageError as { message?: string })?.message
            }`)
          }

          const { error: notifyError } = await supabaseAdmin.from('notifications').insert({
            merchant_id: order.merchant_id,
            deal_id: order.deal_id,
            student_name: 'Student',
            student_email: null,
            message: `Payment received for Unipicks order ${order.id}.`,
            type: 'payment_received',
            read: false,
          })
          if (notifyError) console.error(`[reconcile-payments] order=${order.id} merchant notification failed: ${notifyError.message}`)

          counts.confirmed += 1
          logAction('paid', 'confirmed')
          continue
        }

        if (result.status === 'failed') {
          const { data: reverted, error: orderError } = await supabaseAdmin
            .from('orders')
            .update({ status: 'confirmed', updated_at: nowIso })
            .eq('id', order.id)
            .eq('status', 'payment_processing')
            .select('id')
          if (orderError) throw new Error(`order update: ${orderError.message}`)

          const { error: txUpdateError } = await supabaseAdmin
            .from('transactions')
            .update({ status: 'failed', webhook_payload: result.payload, updated_at: nowIso })
            .eq('id', tx.id)
            .eq('status', 'processing')
          if (txUpdateError) throw new Error(`transaction update: ${txUpdateError.message}`)

          if (!reverted || reverted.length === 0) {
            logAction('failed', 'skipped:order_already_moved')
            continue
          }

          const { error: notifyError } = await supabaseAdmin.from('user_notifications').insert({
            user_id: order.student_id,
            type: 'payment_failed',
            reference_id: order.id,
            message: `Your payment for order ${order.id.slice(0, 8).toUpperCase()} did not go through. You can try again from your orders.`,
            link_path: '/dashboard/profile?view=orders',
          })
          if (notifyError) console.error(`[reconcile-payments] order=${order.id} student notification failed: ${notifyError.message}`)

          counts.failed += 1
          logAction('failed', 'reverted_to_confirmed')
          continue
        }

        // Pending: abandon after 24h, otherwise leave for the next run.
        const startedAt = Math.min(
          Date.parse(order.created_at ?? '') || now,
          Date.parse(tx.created_at ?? '') || now,
        )
        if (now - startedAt > ABANDON_AFTER_MS) {
          const { data: expired, error: orderError } = await supabaseAdmin
            .from('orders')
            .update({ status: 'payment_expired', updated_at: nowIso })
            .eq('id', order.id)
            .eq('status', 'payment_processing')
            .select('id')
          if (orderError) throw new Error(`order update: ${orderError.message}`)

          const { error: txUpdateError } = await supabaseAdmin
            .from('transactions')
            .update({
              status: 'failed',
              webhook_payload: { ...result.payload, unipicks_result: 'abandoned_after_24h_pending' },
              updated_at: nowIso,
            })
            .eq('id', tx.id)
            .eq('status', 'processing')
          if (txUpdateError) throw new Error(`transaction update: ${txUpdateError.message}`)

          if (expired && expired.length > 0) {
            counts.abandoned += 1
            logAction('pending', 'abandoned')
          } else {
            logAction('pending', 'skipped:order_already_moved')
          }
          continue
        }

        counts.still_pending += 1
        logAction('pending', 'left_pending')
      } catch (error) {
        counts.errored += 1
        logAction(result.status, `errored:${error instanceof Error ? error.message : 'unknown'}`)
      }
    }

    console.log(
      `[reconcile-payments] checked=${counts.checked} confirmed=${counts.confirmed} failed=${counts.failed} ` +
        `pending=${counts.still_pending} abandoned=${counts.abandoned} errored=${counts.errored}`,
    )
    return json({ success: true, ...counts })
  } catch (error) {
    // Database failure: 500 so cron retries; nothing half-applied per order.
    console.error('[reconcile-payments] run failed:', error instanceof Error ? error.message : error)
    return json({ error: 'Reconciliation failed', ...counts }, 500)
  }
})

// deno-lint-ignore no-explicit-any
async function ensureRedemption(supabaseAdmin: any, order: Order): Promise<{ id: string; code: string }> {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('redemptions')
    .select('id, code, status')
    .eq('order_id', order.id)
    .maybeSingle()
  if (existingError) throw new Error(`redemption lookup: ${existingError.message}`)
  if (existing) return existing

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = String(Math.floor(1000 + Math.random() * 9000))
    const { data: redemption, error } = await supabaseAdmin
      .from('redemptions')
      .insert({ order_id: order.id, deal_id: order.deal_id, student_id: order.student_id, code, status: 'pending' })
      .select('id, code, status')
      .maybeSingle()
    if (!error && redemption) return redemption
    if (error?.code !== '23505') throw new Error(`redemption insert: ${error?.message ?? 'unknown'}`)
    const { data: concurrent } = await supabaseAdmin
      .from('redemptions')
      .select('id, code, status')
      .eq('order_id', order.id)
      .maybeSingle()
    if (concurrent) return concurrent
  }
  throw new Error('redemption insert: no free code after 5 attempts')
}
