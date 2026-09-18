import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceRoleKey =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
)

type Order = {
  id: string
  student_id: string
  merchant_id: string
  deal_id: string
  quantity: number
  unit_price: number | string
  total_price: number | string
  status: string
  confirmation_deadline: string
  payment_deadline: string | null
}

type Redemption = {
  id: string
  code: string
  status: string
}

type Transaction = {
  id: string
  redemption_id: string
  merchant_reference: string | null
  umunota_reference: string | null
  status: string
  webhook_payload: Record<string, unknown> | null
}

function json(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    },
  )
}

function normalizeProviderStatus(
  payload: Record<string, unknown>,
): string {
  const candidates = [
    payload.status,
    payload.payment_status,
    payload.state,
    payload.result,
    payload.data &&
    typeof payload.data === 'object'
      ? (payload.data as Record<string, unknown>).status
      : null,
    payload.data &&
    typeof payload.data === 'object'
      ? (payload.data as Record<string, unknown>).payment_status
      : null,
  ]

  for (const value of candidates) {
    if (typeof value === 'string') {
      return value.trim().toLowerCase()
    }
  }

  return ''
}

function extractUmunotaReference(
  payload: Record<string, unknown>,
): string | null {
  const candidates = [
    payload.reference,
    payload.transaction_id,
    payload.external_id,
    payload.payment_id,
    payload.id,
  ]

  if (
    payload.data &&
    typeof payload.data === 'object'
  ) {
    const data = payload.data as Record<string, unknown>

    candidates.push(
      data.reference,
      data.transaction_id,
      data.external_id,
      data.payment_id,
      data.id,
    )
  }

  for (const value of candidates) {
    if (
      typeof value === 'string' &&
      value.trim()
    ) {
      return value.trim()
    }
  }

  return null
}

async function createHmacSignature(
  secret: string,
  message: string,
): Promise<string> {
  const encoder = new TextEncoder()

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message),
  )

  return Array.from(
    new Uint8Array(signature),
  )
    .map((byte) =>
      byte.toString(16).padStart(2, '0'),
    )
    .join('')
}

async function callUmunotaPay({
  amount,
  phone,
  description,
  merchant_reference,
}: {
  amount: number
  phone: string
  description: string
  merchant_reference: string
}): Promise<Record<string, unknown>> {
  const apiKey =
    Deno.env.get('UMUNOTA_API_KEY') ?? ''

  const webhookSecret =
    Deno.env.get('UMUNOTA_WEBHOOK_SECRET') ?? ''

  if (!apiKey) {
    throw new Error(
      'UMUNOTA_API_KEY is not configured.',
    )
  }

  const baseUrl =
    'https://api.umunotapay.com'

  const path = '/api/v1/payments'

  const payload = {
    amount: String(amount),
    phone,
    description,
    merchant_reference,
  }

  const body = JSON.stringify(payload)

  const timestamp =
    Math.floor(Date.now() / 1000).toString()

  const nonce = crypto.randomUUID()

  const signingMessage =
    `POST\n${path}\n${body}\n${timestamp}\n${nonce}`

  const signature = webhookSecret
    ? await createHmacSignature(
        webhookSecret,
        signingMessage,
      )
    : ''

  const response = await fetch(
    `${baseUrl}${path}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'X-Signature': signature,
        'Idempotency-Key':
          `${merchant_reference}-collect`,
      },
      body,
    },
  )

  const responseText =
    await response.text()

  let responseBody: Record<string, unknown> = {}

  try {
    responseBody =
      responseText
        ? JSON.parse(responseText)
        : {}
  } catch {
    responseBody = {
      raw_response: responseText,
    }
  }

  if (!response.ok) {
    console.error(
      'UmunotaPay returned an error:',
      response.status,
      responseBody,
    )

    throw new Error(
      `UmunotaPay returned HTTP ${response.status}.`,
    )
  }

  return responseBody
}

function generateRedemptionCode(): string {
  return Math.floor(
    1000 + Math.random() * 9000,
  ).toString()
}

async function ensureRedemption({
  orderId,
  dealId,
  studentId,
}: {
  orderId: string
  dealId: string
  studentId: string
}): Promise<Redemption> {
  const {
    data: existing,
    error: existingError,
  } = await supabaseAdmin
    .from('redemptions')
    .select('id, code, status')
    .eq('order_id', orderId)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing) {
    return existing as Redemption
  }

  const code =
    generateRedemptionCode()

  const {
    data: created,
    error: createError,
  } = await supabaseAdmin
    .from('redemptions')
    .insert({
      order_id: orderId,
      deal_id: dealId,
      student_id: studentId,
      code,
      status: 'pending',
    })
    .select('id, code, status')
    .single()

  if (!createError && created) {
    return created as Redemption
  }

  /*
   * Another request may have created the
   * redemption at the same time.
   */
  const {
    data: racedExisting,
    error: racedError,
  } = await supabaseAdmin
    .from('redemptions')
    .select('id, code, status')
    .eq('order_id', orderId)
    .maybeSingle()

  if (racedError) {
    throw racedError
  }

  if (racedExisting) {
    return racedExisting as Redemption
  }

  throw createError ??
    new Error(
      'Could not create redemption.',
    )
}

/*
 * Send the pickup code through the existing
 * student-business messaging system.
 *
 * The merchant is the sender because the
 * conversation is between the student and
 * the business.
 */
async function sendPickupCodeMessage({
  order,
  redemption,
}: {
  order: Order
  redemption: Redemption
}): Promise<void> {
  const pickupMessage =
    `Payment received 🎉\n\n` +
    `Your order is confirmed.\n` +
    `Pickup code: ${redemption.code}\n\n` +
    `Show this code to the business when collecting your order.`

  /*
   * chat_messages does not currently have an
   * order_id column, so we identify this system
   * message using the exact pickup-code text.
   *
   * This prevents the same payment call from
   * creating duplicate pickup-code messages.
   */
  const {
    data: existingMessages,
    error: existingMessageError,
  } = await supabaseAdmin
    .from('chat_messages')
    .select('id, message')
    .eq('sender_id', order.merchant_id)
    .eq('receiver_id', order.student_id)
    .eq('deal_id', order.deal_id)
    .eq(
      'message',
      pickupMessage,
    )
    .limit(1)

  if (existingMessageError) {
    throw existingMessageError
  }

  if (
    existingMessages &&
    existingMessages.length > 0
  ) {
    return
  }

  const {
    error: messageError,
  } = await supabaseAdmin
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
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(
      'ok',
      {
        headers: corsHeaders,
      },
    )
  }

  if (req.method !== 'POST') {
    return json(
      {
        error: 'Method not allowed.',
      },
      405,
    )
  }

  /*
   * Authenticate the student.
   */
  const authHeader =
    req.headers.get('Authorization')

  if (!authHeader) {
    return json(
      {
        error: 'Missing authorization header.',
      },
      401,
    )
  }

  const token =
    authHeader.replace(
      'Bearer ',
      '',
    )

  const {
    data: {
      user,
    },
    error: userError,
  } =
    await supabaseAdmin.auth.getUser(
      token,
    )

  if (userError || !user) {
    console.error(
      'Authentication failed:',
      userError,
    )

    return json(
      {
        error: 'Unauthorized.',
      },
      401,
    )
  }

  let body: Record<string, unknown>

  try {
    body = await req.json()
  } catch {
    return json(
      {
        error: 'Invalid JSON request.',
      },
      400,
    )
  }

  const {
    order_id,
    phone,
  } = body

  if (!order_id || !phone) {
    return json(
      {
        error:
          'Missing required fields: order_id, phone',
      },
      400,
    )
  }

  const normalizedPhone =
    String(phone).replace(
      /\s+/g,
      '',
    )

  const phonePattern =
    /^(078|079|072|073)\d{7}$/

  if (
    !phonePattern.test(
      normalizedPhone,
    )
  ) {
    return json(
      {
        error:
          'Enter a valid Rwanda phone number.',
      },
      400,
    )
  }

  /*
   * Load the Order.
   *
   * The amount comes from the Order,
   * not from the browser.
   */
  const {
    data: order,
    error: orderError,
  } = await supabaseAdmin
    .from('orders')
    .select(
      `
        id,
        student_id,
        merchant_id,
        deal_id,
        quantity,
        unit_price,
        total_price,
        status,
        confirmation_deadline,
        payment_deadline
      `,
    )
    .eq('id', order_id)
    .eq('student_id', user.id)
    .single()

  if (orderError || !order) {
    console.error(
      'Order lookup failed:',
      orderError,
    )

    return json(
      {
        error: 'Order not found.',
      },
      404,
    )
  }

  const typedOrder =
    order as Order

  /*
   * If already paid, return existing
   * payment/redemption information.
   */
  if (
    typedOrder.status === 'paid'
  ) {
    const {
      data: paidTransaction,
    } = await supabaseAdmin
      .from('transactions')
      .select(
        `
          id,
          redemption_id,
          merchant_reference,
          umunota_reference,
          status,
          webhook_payload
        `,
      )
      .eq(
        'normal_order_id',
        typedOrder.id,
      )
      .maybeSingle()

    const {
      data: paidRedemption,
    } = await supabaseAdmin
      .from('redemptions')
      .select(
        'id, code, status',
      )
      .eq(
        'order_id',
        typedOrder.id,
      )
      .maybeSingle()

    /*
     * If payment succeeded previously but
     * the message was not created, make sure
     * it is sent now.
     */
    if (paidRedemption) {
      try {
        await sendPickupCodeMessage({
          order: typedOrder,
          redemption:
            paidRedemption as Redemption,
        })
      } catch (messageError) {
        console.error(
          'Could not send existing pickup code message:',
          messageError,
        )
      }
    }

    return json({
      success: true,
      status: 'paid',
      order_id: typedOrder.id,
      transaction_id:
        paidTransaction?.id ??
        null,
      redemption:
        paidRedemption ?? null,
      message:
        'Order has already been paid.',
    })
  }

  /*
   * Only confirmed orders can enter payment.
   */
  if (
    typedOrder.status !== 'confirmed'
  ) {
    return json(
      {
        error:
          `This order cannot be paid because its current status is ${typedOrder.status}.`,
      },
      409,
    )
  }

  /*
   * Enforce the student's five-minute
   * payment window.
   */
  if (
    !typedOrder.payment_deadline ||
    new Date(
      typedOrder.payment_deadline,
    ) <= new Date()
  ) {
    await supabaseAdmin
      .from('orders')
      .update({
        status:
          'payment_expired',
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        'id',
        typedOrder.id,
      )
      .eq(
        'status',
        'confirmed',
      )

    return json(
      {
        error:
          'The 5-minute payment window has expired.',
      },
      409,
    )
  }

  /*
   * The live transactions table requires
   * redemption_id to be NOT NULL.
   */
  let redemption: Redemption

  try {
    redemption =
      await ensureRedemption({
        orderId:
          typedOrder.id,
        dealId:
          typedOrder.deal_id,
        studentId:
          typedOrder.student_id,
      })
  } catch (redemptionError) {
    console.error(
      'Could not prepare redemption:',
      redemptionError,
    )

    return json(
      {
        error:
          'Could not prepare the order for payment.',
      },
      500,
    )
  }

  /*
   * Check for an existing transaction.
   */
  const {
    data: existingTransaction,
    error: existingError,
  } =
    await supabaseAdmin
      .from('transactions')
      .select(
        `
          id,
          redemption_id,
          merchant_reference,
          umunota_reference,
          status,
          webhook_payload
        `,
      )
      .eq(
        'normal_order_id',
        typedOrder.id,
      )
      .maybeSingle()

  if (existingError) {
    console.error(
      'Could not check existing transaction:',
      existingError,
    )

    return json(
      {
        error:
          'Could not check payment status.',
      },
      500,
    )
  }

  let transaction:
    Transaction

  /*
   * Existing transaction handling.
   */
  if (existingTransaction) {
    /*
     * Never charge again when payment
     * already succeeded.
     */
    if (
      existingTransaction.status ===
      'paid'
    ) {
      await supabaseAdmin
        .from('orders')
        .update({
          status: 'paid',
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          typedOrder.id,
        )
        .in(
          'status',
          [
            'confirmed',
            'payment_processing',
          ],
        )

      try {
        await sendPickupCodeMessage({
          order: typedOrder,
          redemption,
        })
      } catch (messageError) {
        console.error(
          'Could not send pickup code message:',
          messageError,
        )
      }

      return json({
        success: true,
        status: 'paid',
        order_id:
          typedOrder.id,
        transaction_id:
          existingTransaction.id,
        redemption,
        message:
          'Order has already been paid.',
      })
    }

    /*
     * Do not send another payment request
     * while one is already processing.
     */
    if (
      existingTransaction.status ===
        'pending' ||
      existingTransaction.status ===
        'processing'
    ) {
      return json({
        success: true,
        status: 'processing',
        order_id:
          typedOrder.id,
        transaction_id:
          existingTransaction.id,
        redemption,
        message:
          'A payment request is already processing.',
      })
    }

    /*
     * Failed transaction can be retried.
     */
    if (
      existingTransaction.status ===
      'failed'
    ) {
      const newMerchantReference =
        crypto.randomUUID()

      const {
        data:
          retriedTransaction,
        error: retryError,
      } =
        await supabaseAdmin
          .from('transactions')
          .update({
            redemption_id:
              redemption.id,
            student_id:
              typedOrder.student_id,
            deal_id:
              typedOrder.deal_id,
            normal_order_id:
              typedOrder.id,
            amount:
              Math.round(
                Number(
                  typedOrder.total_price,
                ),
              ),
            currency: 'RWF',
            payment_method:
              'momo',
            merchant_reference:
              newMerchantReference,
            umunota_reference:
              null,
            status: 'pending',
            webhook_payload: {},
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            'id',
            existingTransaction.id,
          )
          .select(
            `
              id,
              redemption_id,
              merchant_reference,
              umunota_reference,
              status,
              webhook_payload
            `,
          )
          .single()

      if (
        retryError ||
        !retriedTransaction
      ) {
        console.error(
          'Could not retry transaction:',
          retryError,
        )

        return json(
          {
            error:
              'Could not retry payment.',
          },
          500,
        )
      }

      transaction =
        retriedTransaction as Transaction
    } else {
      return json(
        {
          error:
            `This payment transaction has an unexpected status: ${existingTransaction.status}.`,
        },
        409,
      )
    }
  } else {
    /*
     * Create a new transaction using only
     * columns that exist in the live database.
     */
    const merchantReference =
      crypto.randomUUID()

    const {
      data:
        newTransaction,
      error:
        transactionError,
    } =
      await supabaseAdmin
        .from('transactions')
        .insert({
          redemption_id:
            redemption.id,
          student_id:
            typedOrder.student_id,
          deal_id:
            typedOrder.deal_id,
          normal_order_id:
            typedOrder.id,
          amount:
            Math.round(
              Number(
                typedOrder.total_price,
              ),
            ),
          currency: 'RWF',
          payment_method:
            'momo',
          merchant_reference:
            merchantReference,
          status: 'pending',
          webhook_payload: {},
        })
        .select(
          `
            id,
            redemption_id,
            merchant_reference,
            umunota_reference,
            status,
            webhook_payload
          `,
        )
        .single()

    if (
      transactionError ||
      !newTransaction
    ) {
      console.error(
        'Could not create transaction:',
        transactionError,
      )

      return json(
        {
          error:
            'Failed to create payment transaction.',
        },
        500,
      )
    }

    transaction =
      newTransaction as Transaction
  }

  /*
   * Move the Order into payment processing.
   */
  const {
    error:
      orderUpdateError,
  } =
    await supabaseAdmin
      .from('orders')
      .update({
        status:
          'payment_processing',
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        'id',
        typedOrder.id,
      )
      .eq(
        'status',
        'confirmed',
      )

  if (orderUpdateError) {
    console.error(
      'Could not update order to payment_processing:',
      orderUpdateError,
    )

    await supabaseAdmin
      .from('transactions')
      .update({
        status: 'failed',
        webhook_payload: {
          error:
            'Could not move order into payment processing.',
        },
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        'id',
        transaction.id,
      )

    return json(
      {
        error:
          'Could not start payment.',
      },
      500,
    )
  }

  /*
   * Mark the transaction as processing
   * before contacting UmunotaPay.
   */
  await supabaseAdmin
    .from('transactions')
    .update({
      status: 'processing',
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      'id',
      transaction.id,
    )

  transaction.status =
    'processing'

  let umunotaResponse:
    Record<string, unknown>

  try {
    umunotaResponse =
      await callUmunotaPay({
        amount:
          Math.round(
            Number(
              typedOrder.total_price,
            ),
          ),
        phone:
          normalizedPhone,
        description:
          `Unipicks order #${typedOrder.id}`,
        merchant_reference:
          transaction.merchant_reference ??
          transaction.id,
      })
  } catch (apiError) {
    console.error(
      'UmunotaPay API error:',
      apiError,
    )

    await supabaseAdmin
      .from('transactions')
      .update({
        status: 'failed',
        webhook_payload: {
          error:
            apiError instanceof
            Error
              ? apiError.message
              : 'Payment service error',
        },
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        'id',
        transaction.id,
      )

    await supabaseAdmin
      .from('orders')
      .update({
        status: 'confirmed',
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        'id',
        typedOrder.id,
      )
      .eq(
        'status',
        'payment_processing',
      )

    return json(
      {
        error:
          'Payment service error.',
      },
      502,
    )
  }

  const providerStatus =
    normalizeProviderStatus(
      umunotaResponse,
    )

  const isPaid = [
    'success',
    'completed',
    'paid',
    'approved',
  ].includes(
    providerStatus,
  )

  const isFailed = [
    'failed',
    'cancelled',
    'canceled',
    'declined',
  ].includes(
    providerStatus,
  )

  const transactionStatus =
    isPaid
      ? 'paid'
      : isFailed
        ? 'failed'
        : 'processing'

  const umunotaReference =
    extractUmunotaReference(
      umunotaResponse,
    )

  const {
    data:
      updatedTransaction,
    error:
      finalTransactionError,
  } =
    await supabaseAdmin
      .from('transactions')
      .update({
        status:
          transactionStatus,
        umunota_reference:
          umunotaReference,
        webhook_payload:
          umunotaResponse,
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        'id',
        transaction.id,
      )
      .select(
        `
          id,
          redemption_id,
          merchant_reference,
          umunota_reference,
          status,
          webhook_payload
        `,
      )
      .single()

  if (
    finalTransactionError ||
    !updatedTransaction
  ) {
    console.error(
      'Could not update transaction:',
      finalTransactionError,
    )

    return json(
      {
        error:
          'Could not save payment result.',
      },
      500,
    )
  }

  transaction =
    updatedTransaction as Transaction

  /*
   * Provider says payment succeeded immediately.
   */
  if (isPaid) {
    /*
     * Keep the existing payment-window rule.
     */
    if (
      typedOrder.payment_deadline &&
      new Date(
        typedOrder.payment_deadline,
      ) <= new Date()
    ) {
      await supabaseAdmin
        .from('transactions')
        .update({
          status: 'failed',
          webhook_payload: {
            ...umunotaResponse,
            unipicks_result:
              'Payment arrived after the payment deadline.',
          },
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          transaction.id,
        )

      await supabaseAdmin
        .from('orders')
        .update({
          status:
            'payment_expired',
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          typedOrder.id,
        )
        .eq(
          'status',
          'payment_processing',
        )

      return json(
        {
          error:
            'The payment arrived after the 5-minute payment window expired.',
        },
        409,
      )
    }

    /*
     * Mark the Order as paid.
     */
    const {
      error:
        paidOrderError,
    } =
      await supabaseAdmin
        .from('orders')
        .update({
          status: 'paid',
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          typedOrder.id,
        )
        .eq(
          'status',
          'payment_processing',
        )

    if (paidOrderError) {
      console.error(
        'Could not mark order as paid:',
        paidOrderError,
      )

      return json(
        {
          error:
            'Could not finalize the order.',
        },
        500,
      )
    }

    /*
     * The redemption already exists.
     *
     * Now send the pickup code through
     * the existing student-business
     * message conversation.
     *
     * Message failure should NOT make a
     * successful payment look like a
     * failed payment.
     */
    try {
      await sendPickupCodeMessage({
        order: typedOrder,
        redemption,
      })
    } catch (messageError) {
      console.error(
        'Payment succeeded but pickup code message could not be sent:',
        messageError,
      )
    }

    return json({
      success: true,
      status: 'paid',
      order_id:
        typedOrder.id,
      transaction_id:
        transaction.id,
      redemption,
    })
  }

  /*
   * Provider says payment failed.
   *
   * The student can try again while
   * the Order remains confirmed.
   */
  if (isFailed) {
    await supabaseAdmin
      .from('orders')
      .update({
        status: 'confirmed',
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        'id',
        typedOrder.id,
      )
      .eq(
        'status',
        'payment_processing',
      )

    return json({
      success: true,
      status: 'failed',
      order_id:
        typedOrder.id,
      transaction_id:
        transaction.id,
      redemption,
      message:
        'Payment failed. You can try again.',
    })
  }

  /*
   * Provider has accepted the payment
   * but has not finished it yet.
   *
   * The webhook should update the
   * transaction/order when the final
   * result arrives.
   */
  return json({
    success: true,
    status: 'processing',
    order_id:
      typedOrder.id,
    transaction_id:
      transaction.id,
    redemption,
    message:
      'Payment is processing.',
  })
})