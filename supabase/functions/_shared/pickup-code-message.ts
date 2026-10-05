// Shared by process-payment (synchronous payment result) and payment-webhook
// (asynchronous result). Both must produce byte-identical text: chat_messages
// has no order_id column, so the exact text is what prevents a duplicate
// pickup-code message when both paths run for the same payment.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any

export type PickupOrder = {
  merchant_id: string
  student_id: string
  deal_id: string
  merchant_phone: string | null
}

export function buildPickupCodeMessage(order: PickupOrder, code: string): string {
  const phoneLine = order.merchant_phone
    ? `\n\n📞 Business phone: ${order.merchant_phone}\nCall them if you have any issue with this order.`
    : ''

  return (
    `Payment received 🎉\n\n` +
    `Your order is confirmed.\n` +
    `Pickup code: ${code}\n\n` +
    `Show this code to the business when collecting your order.` +
    phoneLine
  )
}

/*
 * Send the pickup code through the existing student-business chat.
 * The merchant is the sender because the conversation is between the
 * student and the business. Idempotent: does nothing if the identical
 * message already exists. Throws on database errors.
 */
export async function sendPickupCodeMessage(
  supabaseAdmin: SupabaseClient,
  order: PickupOrder,
  code: string,
): Promise<'sent' | 'already_sent'> {
  const pickupMessage = buildPickupCodeMessage(order, code)

  const { data: existingMessages, error: existingMessageError } = await supabaseAdmin
    .from('chat_messages')
    .select('id, message')
    .eq('sender_id', order.merchant_id)
    .eq('receiver_id', order.student_id)
    .eq('deal_id', order.deal_id)
    .eq('message', pickupMessage)
    .limit(1)

  if (existingMessageError) {
    throw existingMessageError
  }

  if (existingMessages && existingMessages.length > 0) {
    return 'already_sent'
  }

  const { error: messageError } = await supabaseAdmin
    .from('chat_messages')
    .insert({
      sender_id: order.merchant_id,
      receiver_id: order.student_id,
      deal_id: order.deal_id,
      message: pickupMessage,
      is_read: false,
    })

  if (messageError) {
    throw messageError
  }

  return 'sent'
}
