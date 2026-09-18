import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

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
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await req.json()
    const { deal_id, quantity = 1 } = body

    if (!deal_id) {
      return new Response(
        JSON.stringify({ error: 'Missing deal_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return new Response(
        JSON.stringify({ error: 'Quantity must be a positive whole number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: deal, error: dealError } = await supabaseAdmin
      .from('deals')
      .select('id, merchant_id, price, discount_percent, active, expires_at')
      .eq('id', deal_id)
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

    if (deal.price == null) {
      return new Response(
        JSON.stringify({ error: 'This deal does not have a valid price' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const discountPercent = Number(deal.discount_percent ?? 0)
    const unitPrice =
      Math.round(Number(deal.price) * (1 - discountPercent / 100) * 100) / 100

    const totalPrice =
      Math.round(unitPrice * quantity * 100) / 100

    const confirmationDeadline = new Date(
      Date.now() + 5 * 60 * 1000,
    ).toISOString()

    const {
      data: { user: merchantUser },
      error: merchantUserError,
    } = await supabaseAdmin.auth.admin.getUserById(deal.merchant_id)

    if (merchantUserError) {
      console.error('Failed to load merchant account:', merchantUserError)
    }

    const merchantPhone = merchantUser?.user_metadata?.phone ?? null

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        student_id: user.id,
        student_phone: user.user_metadata?.phone ?? null,
        merchant_id: deal.merchant_id,
        merchant_phone: merchantPhone,
        deal_id: deal.id,
        quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
        status: 'pending_confirmation',
        confirmation_deadline: confirmationDeadline,
      })
      .select('*')
      .single()

    if (orderError) {
      console.error('Failed to create order:', orderError)

      return new Response(
        JSON.stringify({ error: 'Failed to create order' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

  const studentName = user.user_metadata?.full_name ?? user.email ?? 'Student'

  const { error: notificationError } = await supabaseAdmin
    .from('notifications')
    .insert({
      merchant_id: deal.merchant_id,
      deal_id: deal.id,
      student_name: studentName,
      student_email: user.email ?? '',
      message: `🛒 New order from ${studentName} for ${quantity} item${quantity === 1 ? '' : 's'}.`,
      type: 'order_pending',
      read: false,
    })

  if (notificationError) {
    console.error('Failed to create order notification:', notificationError)
  }
    return new Response(
      JSON.stringify({ order }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  } catch (error) {
    console.error('Unexpected create-order error:', error)

    return new Response(
      JSON.stringify({ error: 'Unexpected server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
