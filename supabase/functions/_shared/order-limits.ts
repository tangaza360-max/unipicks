// Spam guard for ordering (OWASP API Security Top 10 2023, API6: sensitive
// business flows; API4: resource consumption). A student can have at most
// MAX_WAITING_ORDERS orders waiting at once, so nobody can flood a business
// with orders. The quantity inside one order is not limited (founder decision).
//
// "Waiting" = the business has not answered (pending_confirmation) or the
// student has not paid yet (confirmed). payment_processing is not counted:
// a payment has started, and a hung payment must not block the student.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any

export const MAX_WAITING_ORDERS = 3
export const WAITING_ORDER_STATUSES = ['pending_confirmation', 'confirmed']

export const TOO_MANY_WAITING_ORDERS_ERROR =
  `You already have ${MAX_WAITING_ORDERS} orders waiting for a business to answer or for your payment. ` +
  'Please pay or wait for an answer before ordering again.'

export async function hasTooManyWaitingOrders(
  supabaseAdmin: SupabaseClient,
  studentId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('id')
    .eq('student_id', studentId)
    .in('status', WAITING_ORDER_STATUSES)
  if (error) throw new Error(`Could not count waiting orders: ${error.message}`)
  return (data ?? []).length >= MAX_WAITING_ORDERS
}
