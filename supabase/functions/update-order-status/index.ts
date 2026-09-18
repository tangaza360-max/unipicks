import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, apikey, x-client-info',
}

const declineReasons: Record<string, string> = {
  unavailable: 'The item is currently unavailable.',
  too_busy: 'The business is too busy to fulfill the order right now.',
  closed: 'The business is currently closed.',
  price_changed: 'The price of the deal has changed.',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing Supabase environment variables')
      return jsonResponse({ error: 'Server configuration error' }, 500)
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    )

    const authHeader = req.headers.get('Authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const token = authHeader.slice('Bearer '.length).trim()

    if (!token) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      console.error('Authentication failed:', authError)
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    let body: {
      order_id?: string
      action?: string
      decline_reason?: string | null
      decline_reason_note?: string | null
    }

    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const {
      order_id,
      action,
      decline_reason,
      decline_reason_note,
    } = body

    if (!order_id) {
      return jsonResponse({ error: 'Missing order_id' }, 400)
    }

    if (!['accept', 'decline'].includes(action ?? '')) {
      return jsonResponse(
        { error: 'Action must be accept or decline' },
        400,
      )
    }

    if (action === 'decline') {
      if (
        !decline_reason ||
        ![
          ...Object.keys(declineReasons),
          'other',
        ].includes(decline_reason)
      ) {
        return jsonResponse(
          { error: 'A valid decline reason is required' },
          400,
        )
      }

      if (decline_reason === 'other') {
        const note = decline_reason_note?.trim() ?? ''

        if (!note) {
          return jsonResponse(
            { error: 'Please provide a reason when selecting Other' },
            400,
          )
        }

        if (note.length > 300) {
          return jsonResponse(
            { error: 'The decline note must be 300 characters or less' },
            400,
          )
        }
      }
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .single()

    if (orderError || !order) {
      console.error('Order lookup failed:', orderError)
      return jsonResponse({ error: 'Order not found' }, 404)
    }

    if (order.merchant_id !== user.id) {
      return jsonResponse(
        { error: 'You are not allowed to update this order' },
        403,
      )
    }

    if (order.status !== 'pending_confirmation') {
      return jsonResponse(
        { error: 'This order is no longer waiting for confirmation' },
        409,
      )
    }

    if (new Date(order.confirmation_deadline) <= new Date()) {
      const { error: expiryError } = await supabaseAdmin
        .from('orders')
        .update({
          status: 'confirmation_expired',
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id)
        .eq('status', 'pending_confirmation')

      if (expiryError) {
        console.error('Failed to expire order:', expiryError)
        return jsonResponse(
          { error: 'Could not update expired order' },
          500,
        )
      }

      return jsonResponse(
        { error: 'The confirmation window has expired' },
        409,
      )
    }

    const now = new Date().toISOString()
    const nextStatus = action === 'accept' ? 'confirmed' : 'declined'

    const paymentDeadline =
      action === 'accept'
        ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
        : null

    const declineNote =
      action === 'decline'
        ? decline_reason === 'other'
          ? decline_reason_note?.trim() ?? null
          : null
        : null

    const { data: updatedOrder, error: updateError } =
      await supabaseAdmin
        .from('orders')
        .update({
          status: nextStatus,
          payment_deadline: paymentDeadline,
          decline_reason:
            action === 'decline' ? decline_reason : null,
          decline_reason_note: declineNote,
          updated_at: now,
        })
        .eq('id', order.id)
        .eq('status', 'pending_confirmation')
        .select('*')
        .single()

    if (updateError || !updatedOrder) {
      console.error('Order update failed:', updateError)

      return jsonResponse(
        { error: 'Order could not be updated' },
        409,
      )
    }

    if (action === 'decline') {
      const reasonMessage =
        decline_reason === 'other'
          ? declineNote
          : declineReasons[decline_reason ?? ''] ??
            'The business declined the order.'

      const message = [
        'The business declined your order.',
        '',
        `Reason: ${reasonMessage}`,
      ].join('\n')

      const { error: messageError } = await supabaseAdmin
        .from('chat_messages')
        .insert({
          sender_id: order.merchant_id,
          receiver_id: order.student_id,
          deal_id: order.deal_id,
          message,
          is_read: false,
        })

      if (messageError) {
        console.error(
          'Decline message creation failed:',
          messageError,
        )

        return jsonResponse(
          {
            error:
              'The order was declined, but the notification message could not be created.',
          },
          500,
        )
      }
    }

    return jsonResponse({
      order: updatedOrder,
    })
  } catch (error) {
    console.error(
      'Unexpected update-order-status error:',
      error,
    )

    return jsonResponse(
      { error: 'Unexpected server error' },
      500,
    )
  }
})