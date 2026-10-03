import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { verifiedStudentError } from '../_shared/verified-student.ts'
import { MERCHANT_UNAVAILABLE_ERROR, merchantStanding } from '../_shared/merchant-standing.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
}

type PricedDeal = {
  offer_type: string | null
  price: number | string | null
  discount_percent: number | null
  discount_value: number | string | null
  final_price: number | string | null
  buy_quantity: number | null
}

type PriceResult =
  | { ok: true; unitPrice: number; totalPrice: number }
  | { ok: false; status: number; error: string }

const roundMoney = (value: number) => Math.round(value * 100) / 100

// Server-side source of truth for what a student is charged.
// Keep in sync with priceOrder() in src/pages/OrderConfirmation.jsx.
function priceOrder(deal: PricedDeal, quantity: number): PriceResult {
  const offerType = deal.offer_type ?? 'percentage'
  const price = deal.price == null ? null : Number(deal.price)

  if (offerType === 'tiered') {
    return { ok: false, status: 409, error: 'Tiered deals are not yet supported at checkout' }
  }

  if (offerType === 'free_shipping') {
    return { ok: false, status: 409, error: 'This deal cannot be ordered yet' }
  }

  if (offerType === 'fixed_price') {
    const bundlePrice = Number(deal.final_price ?? deal.discount_value)

    if (!Number.isFinite(bundlePrice) || bundlePrice <= 0) {
      return { ok: false, status: 409, error: 'This deal does not have a valid price' }
    }

    if (quantity > 1) {
      return { ok: false, status: 400, error: 'Bundle deals can only be ordered one at a time' }
    }

    return { ok: true, unitPrice: roundMoney(bundlePrice), totalPrice: roundMoney(bundlePrice) }
  }

  if (price == null || !Number.isFinite(price) || price <= 0) {
    return { ok: false, status: 409, error: 'This deal does not have a valid price' }
  }

  if (offerType === 'percentage' || offerType === 'group_buy') {
    const discountPercent = Number(deal.discount_percent ?? 0)
    const unitPrice = roundMoney(price * (1 - discountPercent / 100))
    return { ok: true, unitPrice, totalPrice: roundMoney(unitPrice * quantity) }
  }

  if (offerType === 'fixed_amount') {
    const discountValue = Number(deal.discount_value)

    if (!Number.isFinite(discountValue) || discountValue <= 0 || discountValue >= price) {
      return { ok: false, status: 409, error: 'This deal has an invalid discount' }
    }

    const unitPrice = roundMoney(price - discountValue)
    return { ok: true, unitPrice, totalPrice: roundMoney(unitPrice * quantity) }
  }

  if (offerType === 'bogo') {
    // The student pays for buy_quantity items and receives
    // buy_quantity + get_quantity. unit_price is stored per bundle so that
    // quantity × unit_price = total_price holds everywhere it is displayed.
    const buyQuantity = Number(deal.buy_quantity ?? 1)

    if (!Number.isInteger(buyQuantity) || buyQuantity < 1) {
      return { ok: false, status: 409, error: 'This deal has an invalid offer' }
    }

    const unitPrice = roundMoney(price * buyQuantity)
    return { ok: true, unitPrice, totalPrice: roundMoney(unitPrice * quantity) }
  }

  return { ok: false, status: 409, error: 'This deal cannot be ordered yet' }
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
      .select('id, merchant_id, price, discount_percent, active, expires_at, offer_type, discount_value, final_price, buy_quantity')
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

    if (deal.expires_at && new Date(deal.expires_at) <= new Date()) {
      return new Response(
        JSON.stringify({ error: 'This deal has expired' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const pricing = priceOrder(deal, quantity)

    if (!pricing.ok) {
      return new Response(
        JSON.stringify({ error: pricing.error }),
        { status: pricing.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { unitPrice, totalPrice } = pricing

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

    // Banned, deactivated or deleted merchants can't receive orders.
    if ((await merchantStanding(supabaseAdmin, deal.merchant_id, merchantUser ?? null)) !== 'ok') {
      return new Response(
        JSON.stringify({ error: MERCHANT_UNAVAILABLE_ERROR }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
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
