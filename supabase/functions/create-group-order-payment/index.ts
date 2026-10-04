// supabase/functions/create-group-order-payment/index.ts
// Called by a group order host to submit the whole group as ONE merchant order.
// The merchant sees a single order with a group_order_id link and fulfills it normally.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { verifiedStudentError } from '../_shared/verified-student.ts'
import { MERCHANT_UNAVAILABLE_ERROR, merchantStanding } from '../_shared/merchant-standing.ts'
import { dealClosedMessage, isDealOpenNow } from '../_shared/deal-availability.ts'
import { TOO_MANY_WAITING_ORDERS_ERROR, hasTooManyWaitingOrders } from '../_shared/order-limits.ts'
import { alertMerchantNewOrder } from '../_shared/order-alerts.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
}

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Orders are written with the service role, so the database ban triggers
    // can't see the caller here. app_metadata is server-only (P4 migration).
    if (user.app_metadata?.banned === true) {
      return new Response(
        JSON.stringify({ error: 'Your account is suspended. Contact support.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const notVerified = await verifiedStudentError(supabaseAdmin, user)
    if (notVerified) {
      return new Response(
        JSON.stringify({ error: notVerified }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await req.json()
    const { group_order_id } = body

    if (!group_order_id) {
      return new Response(
        JSON.stringify({ error: 'Missing group_order_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Load the group order
    const { data: groupOrder, error: groupError } = await supabaseAdmin
      .from('group_orders')
      .select('id, deal_id, created_by, host_name, join_code, status, expires_at')
      .eq('id', group_order_id)
      .single()

    if (groupError || !groupOrder) {
      return new Response(
        JSON.stringify({ error: 'Group order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (groupOrder.created_by !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Only the host can submit this group order' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (groupOrder.status !== 'open') {
      return new Response(
        JSON.stringify({ error: 'This group order is no longer accepting submissions' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (groupOrder.expires_at && new Date(groupOrder.expires_at) <= new Date()) {
      return new Response(
        JSON.stringify({ error: 'This group closed after 24 hours. Start a new group to order.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Prevent duplicate submissions. Orders that died (declined, expired)
    // don't count: the group was reopened so the host can submit again.
    const { data: liveOrders } = await supabaseAdmin
      .from('orders')
      .select('id, status')
      .eq('group_order_id', groupOrder.id)
    const existingOrder = (liveOrders ?? []).find(
      (o: { status: string }) => !['declined', 'confirmation_expired', 'payment_expired', 'cancelled'].includes(o.status),
    )

    if (existingOrder) {
      return new Response(
        JSON.stringify({ error: 'This group order has already been submitted', order_id: existingOrder.id }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Load members
    const { data: members, error: membersError } = await supabaseAdmin
      .from('group_order_members')
      .select('id, student_id, student_name, quantity')
      .eq('group_order_id', groupOrder.id)

    if (membersError) {
      console.error('Failed to load members:', membersError)
      return new Response(
        JSON.stringify({ error: 'Failed to load group members' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!members || members.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No one has joined this group order yet' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const totalQuantity = members.reduce((sum, m) => sum + (m.quantity || 1), 0)

    // Load the deal
    const { data: deal, error: dealError } = await supabaseAdmin
      .from('deals')
      .select('id, merchant_id, price, discount_percent, active, expires_at, min_participants, available_days, available_from, available_until')
      .eq('id', groupOrder.deal_id)
      .single()

    if (dealError || !deal) {
      return new Response(
        JSON.stringify({ error: 'Deal not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!deal.active) {
      return new Response(
        JSON.stringify({ error: 'This deal is no longer active' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (deal.expires_at && new Date(deal.expires_at) <= new Date()) {
      return new Response(
        JSON.stringify({ error: 'This deal has ended' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // The business's days and hours for this deal (Kigali time).
    if (!isDealOpenNow(deal)) {
      return new Response(
        JSON.stringify({ error: dealClosedMessage(deal) }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Enforce the deal's minimum group size before the merchant ever sees the order.
    // Members are counted as distinct students; a null minimum means no requirement.
    if (deal.min_participants != null) {
      const memberCount = new Set(members.map((m) => m.student_id)).size
      const missing = Number(deal.min_participants) - memberCount

      if (missing > 0) {
        return new Response(
          JSON.stringify({
            error: `This group needs ${missing} more member${missing === 1 ? '' : 's'} before it can be submitted`,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    if (deal.price == null) {
      return new Response(
        JSON.stringify({ error: 'This deal does not have a valid price' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const discountPercent = Number(deal.discount_percent ?? 0)
    const unitPrice = Math.round(Number(deal.price) * (1 - discountPercent / 100) * 100) / 100
    const totalPrice = Math.round(unitPrice * totalQuantity * 100) / 100

    const confirmationDeadline = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    // Load merchant phone
    const { data: { user: merchantUser }, error: merchantUserError } =
      await supabaseAdmin.auth.admin.getUserById(deal.merchant_id)

    if (merchantUserError) {
      console.error('Failed to load merchant account:', merchantUserError)
    }

    // Banned, deactivated or deleted merchants can't receive orders.
    if ((await merchantStanding(supabaseAdmin, deal.merchant_id, merchantUser ?? null)) !== 'ok') {
      return new Response(
        JSON.stringify({ error: MERCHANT_UNAVAILABLE_ERROR }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Spam guard: at most 3 orders waiting per student (the group order is
    // saved under the host).
    if (await hasTooManyWaitingOrders(supabaseAdmin, user.id)) {
      return new Response(
        JSON.stringify({ error: TOO_MANY_WAITING_ORDERS_ERROR }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const merchantPhone = merchantUser?.user_metadata?.phone ?? null

    // Create the master order (one row for the whole group)
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        student_id: user.id,
        student_phone: user.user_metadata?.phone ?? null,
        merchant_id: deal.merchant_id,
        merchant_phone: merchantPhone,
        deal_id: deal.id,
        quantity: totalQuantity,
        unit_price: unitPrice,
        total_price: totalPrice,
        status: 'pending_confirmation',
        confirmation_deadline: confirmationDeadline,
        group_order_id: groupOrder.id,
      })
      .select('*')
      .single()

    if (orderError) {
      console.error('Failed to create group order:', orderError)
      return new Response(
        JSON.stringify({ error: 'Failed to create group order' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Close the group order so no more joiners
    await supabaseAdmin
      .from('group_orders')
      .update({ status: 'closed' })
      .eq('id', groupOrder.id)

    // Notify the merchant
    const hostName = groupOrder.host_name ?? user.user_metadata?.full_name ?? user.email ?? 'Student'
    const memberCount = members.length

    await supabaseAdmin
      .from('notifications')
      .insert({
        merchant_id: deal.merchant_id,
        deal_id: deal.id,
        student_name: hostName,
        student_email: user.email ?? '',
        message: `Group order from ${hostName}: ${memberCount} member${memberCount === 1 ? '' : 's'}, ${totalQuantity} item${totalQuantity === 1 ? '' : 's'}, ${totalPrice.toLocaleString()} RWF total.`,
        type: 'order_pending',
        read: false,
      })

    await alertMerchantNewOrder(
      supabaseAdmin,
      { id: order.id, merchant_id: deal.merchant_id, deal_id: deal.id, quantity: totalQuantity },
      { students: memberCount },
    )

    return new Response(
      JSON.stringify({ order }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('Unexpected create-group-order-payment error:', error)
    return new Response(
      JSON.stringify({ error: 'Unexpected server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
