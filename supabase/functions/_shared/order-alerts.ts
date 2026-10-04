// Phone alerts for order events (founder decision 2026-10-04: these 4 events,
// with the deal name). Texts never contain pickup codes, phone numbers or
// student names: alerts pass through Google/Apple/Mozilla push services.
// Every function here never throws (see sendPushToUser).
import { sendPushToUser, type PushResult } from './web-push.ts'

// deno-lint-ignore no-explicit-any
type SupabaseClient = any

const FIVE_MINUTES = 5 * 60
const ONE_DAY = 24 * 60 * 60

function shortId(orderId: string) {
  return orderId.slice(0, 8).toUpperCase()
}

async function dealTitle(supabaseAdmin: SupabaseClient, dealId: string | null | undefined): Promise<string> {
  if (!dealId) return 'Your deal'
  try {
    const { data } = await supabaseAdmin.from('deals').select('title').eq('id', dealId).maybeSingle()
    return data?.title?.trim() || 'Your deal'
  } catch {
    return 'Your deal'
  }
}

// Business: a student ordered (5 minutes to answer).
export async function alertMerchantNewOrder(
  supabaseAdmin: SupabaseClient,
  order: { id: string; merchant_id: string; deal_id: string; quantity: number },
  group?: { students: number },
): Promise<PushResult> {
  const title = await dealTitle(supabaseAdmin, order.deal_id)
  const who = group ? ` for ${group.students} student${group.students === 1 ? '' : 's'}` : ''
  return sendPushToUser(supabaseAdmin, order.merchant_id, {
    title: group ? 'New group order' : 'New order',
    body: `${title} ×${order.quantity}${who}. Accept or decline within 5 minutes.`,
    url: '/dashboard/orders',
    tag: `new-order-${order.id}`,
    ttlSeconds: FIVE_MINUTES,
    urgency: 'high',
  })
}

// Student: the business accepted (5 minutes to pay).
export async function alertStudentOrderAccepted(
  supabaseAdmin: SupabaseClient,
  order: { id: string; student_id: string; deal_id: string },
): Promise<PushResult> {
  const title = await dealTitle(supabaseAdmin, order.deal_id)
  return sendPushToUser(supabaseAdmin, order.student_id, {
    title: 'Order accepted: pay now',
    body: `${title}: pay within 5 minutes to confirm your order.`,
    url: `/payment?order_id=${order.id}`,
    tag: `order-${order.id}`,
    ttlSeconds: FIVE_MINUTES,
    urgency: 'high',
  })
}

// Student: the business declined (nothing was paid yet).
export async function alertStudentOrderDeclined(
  supabaseAdmin: SupabaseClient,
  order: { id: string; student_id: string; deal_id: string },
): Promise<PushResult> {
  const title = await dealTitle(supabaseAdmin, order.deal_id)
  return sendPushToUser(supabaseAdmin, order.student_id, {
    title: 'Order declined',
    body: `${title}: the business declined your order. You were not charged.`,
    url: '/dashboard/profile?view=orders',
    tag: `order-${order.id}`,
    ttlSeconds: ONE_DAY,
  })
}

// Business: the student paid.
export async function alertMerchantPaymentReceived(
  supabaseAdmin: SupabaseClient,
  order: { id: string; merchant_id: string; deal_id: string },
): Promise<PushResult> {
  const title = await dealTitle(supabaseAdmin, order.deal_id)
  return sendPushToUser(supabaseAdmin, order.merchant_id, {
    title: 'Payment received',
    body: `${title}: order ${shortId(order.id)} is paid.`,
    url: '/dashboard/orders',
    tag: `paid-${order.id}`,
    ttlSeconds: ONE_DAY,
  })
}
