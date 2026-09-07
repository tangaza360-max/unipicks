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

// --- Helper function: call UmunotaPay API ---
async function callUmunotaPay(payload: {
  amount: number;
  currency: string;
  phone?: string;
  description: string;
  redirect_url: string;
  transaction_id: string;
}) {
  console.log('👉 Calling UmunotaPay with payload:', payload);
  
  // 🔧 When you get the real UmunotaPay API docs, replace this mock with actual fetch:
  // const response = await fetch(`${UMUNOTA_BASE_URL}/pay`, {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${Deno.env.get('UMUNOTA_API_KEY')}`,
  //     'X-Secret': Deno.env.get('UMUNOTA_SECRET') ?? '',
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     amount: payload.amount,
  //     currency: payload.currency,
  //     phone: payload.phone || '',
  //     description: payload.description,
  //     redirect_url: payload.redirect_url,
  //     external_id: payload.transaction_id,
  //   }),
  // });
  // const data = await response.json();
  // return data;

  // --- MOCK response for testing (remove when real API is ready) ---
  return {
    success: true,
    payment_url: `https://pay.umunotapay.com/simulate?amount=${payload.amount}&ref=${payload.transaction_id}`,
    reference: `UM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  };
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

    // 4. Call UmunotaPay API
    const UMUNOTA_REDIRECT_URL = Deno.env.get('UMUNOTA_REDIRECT_URL') || 'https://unipicks.vercel.app/order-confirmed';
    const description = `Unipicks order #${redemption_id}`;
    const redirect_url = `${UMUNOTA_REDIRECT_URL}?transaction_id=${transaction.id}`;

    let umunotaResponse;
    try {
      umunotaResponse = await callUmunotaPay({
        amount: Number(amount),
        currency,
        phone: phone || undefined,
        description,
        redirect_url,
        transaction_id: transaction.id,
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

    // 5. Update transaction with UmunotaPay reference
    const umunota_ref = umunotaResponse.reference || `UM-${Date.now()}`;
    await supabaseAdmin
      .from('transactions')
      .update({
        umunota_reference: umunota_ref,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id);

    // 6. Return payment link to frontend
    const payment_url = umunotaResponse.payment_url;
    if (!payment_url) {
      console.error('❌ UmunotaPay did not return a payment URL');
      return new Response(
        JSON.stringify({ error: 'Payment URL not returned by provider' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`🔗 Payment URL generated: ${payment_url}`);

    return new Response(
      JSON.stringify({
        success: true,
        payment_url,
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