import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { sendPickupCodeMessage } from '../_shared/pickup-code-message.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, apikey, x-client-info, x-webhook-signature, x-umunota-signature',
}

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const encoder = new TextEncoder()

// Constant-time string comparison. Both sides are hashed first so the
// comparison always runs over 32 bytes, regardless of input length.
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ])
  const viewA = new Uint8Array(hashA)
  const viewB = new Uint8Array(hashB)
  let diff = 0
  for (let i = 0; i < viewA.length; i++) diff |= viewA[i] ^ viewB[i]
  return diff === 0
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/*
 * UmunotaPay's webhook signing scheme is not yet confirmed. Accept either:
 *   1. HMAC-SHA256(secret, raw body) as hex, optionally prefixed "sha256=", or
 *   2. the shared secret itself in the signature header (legacy behavior).
 * Both are compared in constant time. Once the provider's scheme is
 * confirmed, remove the path it does not use.
 */
async function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  providedSignature: string,
): Promise<'hmac' | 'shared_secret' | null> {
  const normalized = providedSignature.trim().replace(/^sha256=/i, '').toLowerCase()
  const expectedHmac = await hmacSha256Hex(secret, rawBody)

  if (await timingSafeEqual(normalized, expectedHmac)) return 'hmac'
  if (await timingSafeEqual(providedSignature.trim(), secret)) return 'shared_secret'
  return null
}

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function rejectWebhook(
  request: Request,
  reason: string,
  status: number,
  extra: Record<string, unknown> = {},
) {
  // Never log the secret or the signature value itself.
  console.error('[payment-webhook] rejected request', {
    reason,
    status,
    ip: clientIp(request),
    user_agent: request.headers.get('user-agent') ?? null,
    has_signature_header: Boolean(
      request.headers.get('X-Webhook-Signature') ||
        request.headers.get('X-Umunota-Signature'),
    ),
    ...extra,
  })
  const message =
    status === 503 ? 'Webhook not configured' : status === 400 ? 'Invalid request body' : 'Unauthorized'
  return json({ error: message }, status)
}

function normalizeProviderStatus(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function isSuccessfulStatus(status: string) {
  return ['success', 'successful', 'completed', 'paid', 'approved'].includes(
    status,
  )
}

function isPendingStatus(status: string) {
  return ['pending', 'processing', 'in_progress'].includes(status)
}

function isFailedStatus(status: string) {
  return [
    'failed',
    'cancelled',
    'canceled',
    'declined',
    'rejected',
  ].includes(status)
}

async function ensureRedemption(order: {
  id: string
  deal_id: string
  student_id: string
}) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('redemptions')
    .select('id, code, status')
    .eq('order_id', order.id)
    .maybeSingle()

  if (existingError) {
    throw new Error(`Could not check redemption: ${existingError.message}`)
  }

  if (existing) {
    return existing
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = String(Math.floor(1000 + Math.random() * 9000))

    const { data: redemption, error: redemptionError } = await supabaseAdmin
      .from('redemptions')
      .insert({
        order_id: order.id,
        deal_id: order.deal_id,
        student_id: order.student_id,
        code,
        status: 'pending',
      })
      .select('id, code, status')
      .maybeSingle()

    if (!redemptionError && redemption) {
      return redemption
    }

    if (redemptionError?.code === '23505') {
      const { data: concurrent } = await supabaseAdmin
        .from('redemptions')
        .select('id, code, status')
        .eq('order_id', order.id)
        .maybeSingle()

      if (concurrent) {
        return concurrent
      }

      continue
    }

    throw new Error(
      `Could not create redemption: ${
        redemptionError?.message || 'Unknown error'
      }`,
    )
  }

  throw new Error('Could not create redemption after several attempts.')
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const expectedSecret = Deno.env.get('UMUNOTA_WEBHOOK_SECRET')

    // Fail closed: never process payment updates without a configured secret.
    if (!expectedSecret) {
      console.error(
        '[payment-webhook] CRITICAL: UMUNOTA_WEBHOOK_SECRET is not set. All webhook requests are being rejected until it is configured.',
      )
      return rejectWebhook(request, 'secret_not_configured', 503)
    }

    // Optional source allowlist, e.g. "1.2.3.4,5.6.7.8". Skipped when unset.
    const allowedIps = (Deno.env.get('UMUNOTA_WEBHOOK_ALLOWED_IPS') ?? '')
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean)

    if (allowedIps.length > 0 && !allowedIps.includes(clientIp(request))) {
      return rejectWebhook(request, 'ip_not_allowed', 403)
    }

    const providedSignature =
      request.headers.get('X-Webhook-Signature') ||
      request.headers.get('X-Umunota-Signature')

    if (!providedSignature) {
      return rejectWebhook(request, 'missing_signature', 401)
    }

    // Read the raw body once: the signature is computed over the exact bytes.
    const rawBody = await request.text()

    const verifiedBy = await verifyWebhookSignature(
      expectedSecret,
      rawBody,
      providedSignature,
    )

    if (!verifiedBy) {
      return rejectWebhook(request, 'signature_mismatch', 401, {
        body_length: rawBody.length,
      })
    }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return rejectWebhook(request, 'invalid_json', 400, { body_length: rawBody.length })
    }

    const providerReference = String(
      payload.reference ||
        payload.transaction_id ||
        payload.external_id ||
        payload.id ||
        '',
    ).trim()

    const providerStatus = normalizeProviderStatus(
      payload.status || payload.payment_status,
    )

    if (!providerReference) {
      return json({ error: 'Missing payment reference' }, 400)
    }

    if (!providerStatus) {
      return json({ error: 'Missing payment status' }, 400)
    }

    // Use only the columns and statuses process-payment (verified in production)
    // writes. Production's transactions table predates the repo migration: it has
    // no phone_number (selecting it failed every webhook with 42703), and
    // process-payment never sets reference/provider_response or 'success'.
    // The provider's id is umunota_reference; ours is merchant_reference (sent to
    // UmunotaPay as merchant_reference); the payload goes in webhook_payload.
    const TRANSACTION_COLUMNS =
      'id, student_id, deal_id, normal_order_id, amount, merchant_reference, umunota_reference, status'

    let { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .select(TRANSACTION_COLUMNS)
      .eq('umunota_reference', providerReference)
      .maybeSingle()

    const merchantReference = String(payload.merchant_reference || providerReference).trim()
    if (!transactionError && !transaction && merchantReference) {
      ;({ data: transaction, error: transactionError } = await supabaseAdmin
        .from('transactions')
        .select(TRANSACTION_COLUMNS)
        .eq('merchant_reference', merchantReference)
        .maybeSingle())
    }

    if (transactionError) {
      console.error('Could not find transaction:', transactionError)
      return json({ error: 'Could not find transaction' }, 500)
    }

    if (!transaction) {
      console.error('Transaction not found:', providerReference)
      return json({ error: 'Transaction not found' }, 404)
    }

    if (!transaction.normal_order_id) {
      return json({ error: 'Transaction is not a normal order payment' }, 409)
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(
        'id, student_id, merchant_id, deal_id, total_price, status, payment_deadline, merchant_phone',
      )
      .eq('id', transaction.normal_order_id)
      .maybeSingle()

    if (orderError) {
      console.error('Could not load order:', orderError)
      return json({ error: 'Could not load order' }, 500)
    }

    if (!order) {
      return json({ error: 'Order not found' }, 404)
    }

    if (order.student_id !== transaction.student_id) {
      return json({ error: 'Order ownership mismatch' }, 409)
    }

    const providerAmount = Number(payload.amount)

    if (
      Number.isFinite(providerAmount) &&
      Math.round(providerAmount) !== Math.round(Number(transaction.amount))
    ) {
      console.error('Payment amount mismatch', {
        providerAmount,
        transactionAmount: transaction.amount,
        reference: providerReference,
      })
      return json({ error: 'Payment amount mismatch' }, 409)
    }

    // 'paid' is what process-payment writes; 'success' is the legacy value.
    if (transaction.status === 'paid' || transaction.status === 'success') {
      // A retry after a failed pickup-code delivery lands here: re-send it
      // (idempotent) so the student is never left without their code.
      const { data: existingRedemption } = await supabaseAdmin
        .from('redemptions')
        .select('id, code, status')
        .eq('order_id', order.id)
        .maybeSingle()

      if (existingRedemption?.code) {
        try {
          await sendPickupCodeMessage(supabaseAdmin, order, existingRedemption.code)
        } catch (messageError) {
          console.error('Could not re-send pickup code message:', messageError)
          return json({ error: 'Pickup code message could not be delivered' }, 500)
        }
      }

      return json({
        success: true,
        status: 'success',
        message: 'Payment already processed',
        order_id: order.id,
      })
    }

    if (isPendingStatus(providerStatus)) {
      const { error: pendingError } = await supabaseAdmin
        .from('transactions')
        .update({
          status: 'processing',
          webhook_payload: payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id)

      if (pendingError) {
        console.error('Could not save pending payment:', pendingError)
        return json({ error: 'Could not save payment status' }, 500)
      }

      if (order.status === 'confirmed') {
        await supabaseAdmin
          .from('orders')
          .update({
            status: 'payment_processing',
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.id)
      }

      return json({
        success: true,
        status: 'pending',
        order_id: order.id,
      })
    }

    if (isFailedStatus(providerStatus)) {
      const { error: failedError } = await supabaseAdmin
        .from('transactions')
        .update({
          status: 'failed',
          webhook_payload: payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id)

      if (failedError) {
        console.error('Could not save failed payment:', failedError)
        return json({ error: 'Could not save payment status' }, 500)
      }

      // Failed: the student may try again while the 5-minute window is open;
      // after it, the order expires.
      const windowOpen = Boolean(order.payment_deadline) &&
        new Date(order.payment_deadline) > new Date()
      await supabaseAdmin
        .from('orders')
        .update({
          status: windowOpen ? 'confirmed' : 'payment_expired',
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id)
        .in('status', ['confirmed', 'payment_processing'])

      return json({
        success: true,
        status: 'failed',
        order_id: order.id,
      })
    }

    if (!isSuccessfulStatus(providerStatus)) {
      return json({ error: 'Unknown payment status' }, 400)
    }

    // Late payments are accepted (founder decision, fix 4): the 5-minute
    // window limits *starting* the payment, which process-payment enforces.
    // A transaction only exists if the student pressed Pay in time, so when
    // the money is confirmed the order is paid, even if it took longer or the
    // order was meanwhile marked payment_expired. Never "charged but expired".
    const { error: successError } = await supabaseAdmin
      .from('transactions')
      .update({
        status: 'paid',
        webhook_payload: payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id)

    if (successError) {
      console.error('Could not save successful payment:', successError)
      return json({ error: 'Could not save payment status' }, 500)
    }

    const { error: paidOrderError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'paid',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .in('status', ['confirmed', 'payment_processing', 'payment_expired'])

    if (paidOrderError) {
      console.error('Could not mark order as paid:', paidOrderError)
      return json({ error: 'Could not finalize order' }, 500)
    }

    let redemption

    try {
      redemption = await ensureRedemption({
        id: order.id,
        deal_id: order.deal_id,
        student_id: order.student_id,
      })
    } catch (redemptionError) {
      console.error('Could not create redemption:', redemptionError)
      return json(
        {
          error:
            'Payment succeeded but redemption could not be created.',
        },
        500,
      )
    }

    // The student may have left checkout before the MoMo prompt completed
    // (async path), so this is often the only way they receive their code.
    // On failure return 500: the provider retries, and the retry path above
    // re-sends idempotently.
    try {
      await sendPickupCodeMessage(supabaseAdmin, order, redemption.code)
    } catch (messageError) {
      console.error('Could not send pickup code message:', messageError)
      return json({ error: 'Payment recorded but the pickup code message could not be delivered' }, 500)
    }

    const { error: notificationError } = await supabaseAdmin
      .from('notifications')
      .insert({
        merchant_id: order.merchant_id,
        deal_id: order.deal_id,
        student_name: 'Student',
        student_email: null,
        message: `Payment received for Unipicks order ${order.id}.`,
        type: 'payment_received',
        read: false,
      })

    if (notificationError) {
      console.error('Could not send merchant notification:', notificationError)
    }

    return json({
      success: true,
      status: 'paid',
      order_id: order.id,
      transaction_id: transaction.id,
      redemption,
    })
  } catch (error) {
    console.error('Webhook error:', error)

    return json(
      {
        error: error instanceof Error ? error.message : 'Unexpected webhook error',
      },
      500,
    )
  }
})
