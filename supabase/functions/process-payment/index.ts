// supabase/functions/process-payment/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

// --- CORS Headers ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// --- Supabase Admin Client (bypasses RLS) ---
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// --- Helper: HMAC-SHA256 hex digest, using Web Crypto (Deno-compatible) ---
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- Helper function: call UmunotaPay API ---
async function callUmunotaPay(payload: {
  amount: number;
  phone?: string;
  description: string;
  merchant_reference: string;
}) {
  const UMUNOTA_BASE_URL = 'https://api.umunotapay.com';
  const path = '/api/v1/payments';
  const apiKey = Deno.env.get('UMUNOTA_API_KEY') ?? '';
  const signingSecret = Deno.env.get('UMUNOTA_WEBHOOK_SECRET') ?? '';

  const body = JSON.stringify({
    amount: String(payload.amount),
    phone: payload.phone || '',
    description: payload.description,
    merchant_reference: payload.merchant_reference,
  });

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomNonce();
  const signatureMessage = ['POST', path, body, timestamp, nonce].join('\n');
  const signature = await hmacSha256Hex(signingSecret, signatureMessage);

  console.log(`👉 Calling UmunotaPay: POST ${UMUNOTA_BASE_URL}${path}`);

  const response = await fetch(`${UMUNOTA_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature,
      'Idempotency-Key': `${payload.merchant_reference}-collect`,
    },
    body,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `UmunotaPay returned status ${response.status}`);
  }

  console.log('🔎 Full UmunotaPay response:', JSON.stringify(data));

  return data;
}

// --- Main handler ---
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Authenticate the student
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. Parse request body
    const body = await req.json();
    const { redemption_id, deal_id, amount, phone, currency = 'RWF' } = body;

    if (!redemption_id || !deal_id || !amount) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: redemption_id, deal_id, amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`📝 Processing payment for student ${user.id}, redemption ${redemption_id}, amount ${amount} ${currency}`);

    // 3. Create a pending transaction
    const { data: transaction, error: insertError } = await supabaseAdmin
      .from('transactions')
      .insert({
        redemption_id,
        student_id: user.id,
        deal_id,
        amount,
        currency,
        payment_method: 'momo',
        status: 'pending',
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('❌ Error creating transaction:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create transaction' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`✅ Transaction created: ${transaction.id}`);

    // 4. Call UmunotaPay API (MoMo/Airtel push a USSD prompt directly to the phone)
    const description = `Unipicks order #${redemption_id}`;
    const merchant_reference = transaction.id;

    let umunotaResponse;
    try {
      umunotaResponse = await callUmunotaPay({
        amount: Number(amount),
        phone: phone || undefined,
        description,
        merchant_reference,
      });
    } catch (apiError: any) {
      console.error('❌ UmunotaPay API error:', apiError.message);
      await supabaseAdmin
        .from('transactions')
        .update({ status: 'failed' })
        .eq('id', transaction.id);

      return new Response(
        JSON.stringify({ error: 'Payment service error', details: apiError.message }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 5. Update transaction with UmunotaPay reference and mark as processing
    const umunota_ref =
      umunotaResponse.reference ||
      umunotaResponse.id ||
      umunotaResponse.transaction_id ||
      merchant_reference;

    await supabaseAdmin
      .from('transactions')
      .update({
        umunota_reference: umunota_ref,
        merchant_reference,
        status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id);

    // 6. Tell the frontend the prompt was sent — the webhook will confirm payment later
    console.log(`📲 Payment prompt sent for transaction ${transaction.id}, reference ${umunota_ref}`);

    return new Response(
      JSON.stringify({
        success: true,
        prompt_sent: true,
        transaction_id: transaction.id,
        umunota_reference: umunota_ref,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: any) {
    console.error('❌ Unhandled error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
