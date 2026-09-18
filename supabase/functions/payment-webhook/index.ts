import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

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
    const providedSignature =
      request.headers.get('X-Webhook-Signature') ||
      request.headers.get('X-Umunota-Signature')

    if (expectedSecret) {
      if (!providedSignature || providedSignature !== expectedSecret) {
        console.error('Webhook signature mismatch')
        return json({ error: 'Unauthorized' }, 401)
      }
    }

    const payload = await request.json()

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

    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .select(
        'id, student_id, deal_id, normal_order_id, amount, phone_number, reference, status',
      )
      .eq('reference', providerReference)
      .maybeSingle()

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
        'id, student_id, merchant_id, deal_id, total_price, status, payment_deadline',
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

    if (transaction.status === 'success') {
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
          status: 'pending',
          provider_response: payload,
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
          provider_response: payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id)

      if (failedError) {
        console.error('Could not save failed payment:', failedError)
        return json({ error: 'Could not save payment status' }, 500)
      }

      if (order.status === 'confirmed' || order.status === 'payment_processing') {
        await supabaseAdmin
          .from('orders')
          .update({
            status: 'confirmed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.id)
      }

      return json({
        success: true,
        status: 'failed',
        order_id: order.id,
      })
    }

    if (!isSuccessfulStatus(providerStatus)) {
      return json({ error: 'Unknown payment status' }, 400)
    }

    if (
      !order.payment_deadline ||
      new Date(order.payment_deadline) <= new Date()
    ) {
      await supabaseAdmin
        .from('orders')
        .update({
          status: 'payment_expired',
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id)
        .in('status', ['confirmed', 'payment_processing'])

      await supabaseAdmin
        .from('transactions')
        .update({
          status: 'failed',
          provider_response: {
            ...payload,
            unipicks_result: 'payment_received_after_deadline',
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id)

      return json(
        {
          error: 'Payment arrived after the payment deadline',
          order_id: order.id,
        },
        409,
      )
    }

    const { error: successError } = await supabaseAdmin
      .from('transactions')
      .update({
        status: 'success',
        provider_response: payload,
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
      .in('status', ['confirmed', 'payment_processing'])

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
