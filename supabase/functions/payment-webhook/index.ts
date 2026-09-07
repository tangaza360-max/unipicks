// supabase/functions/payment-webhook/index.ts
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

// --- Helper function: response formatter ---
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// --- Main handler ---
serve(async (request) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST requests
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    // 1. Verify webhook signature (security)
    // 🔧 Replace this with the actual signature verification logic from UmunotaPay
    const expectedSecret = Deno.env.get('UMUNOTA_WEBHOOK_SECRET');
    const providedSignature = request.headers.get('X-Webhook-Signature') || request.headers.get('X-Umunota-Signature');
    // Uncomment this when you have the actual secret:
    // if (expectedSecret && providedSignature !== expectedSecret) {
    //   return json({ error: 'Unauthorized - Invalid signature' }, 401);
    // }

    // 2. Parse the payload
    const payload = await request.json();
    console.log('📩 Webhook received:', payload);

    // 3. Extract the UmunotaPay reference and status
    // 🔧 ADAPT THIS BLOCK to match UmunotaPay's actual webhook payload structure
    const umunota_reference = payload.reference || payload.transaction_id || payload.external_id || payload.id;
    const payment_status = payload.status || payload.payment_status || 'pending';
    const amount = payload.amount;

    if (!umunota_reference) {
      console.error('❌ Missing reference in webhook payload:', payload);
      return json({ error: 'Missing reference in webhook payload' }, 400);
    }

    console.log(`🔍 Looking for transaction with reference: ${umunota_reference}`);

    // 4. Find the matching transaction in our database
    const { data: transaction, error: findError } = await supabaseAdmin
      .from('transactions')
      .select('*, redemptions(deal_id, merchant_id)')
      .eq('umunota_reference', umunota_reference)
      .single();

    if (findError || !transaction) {
      console.error('❌ Transaction not found for reference:', umunota_reference);
      return json({ error: 'Transaction not found' }, 404);
    }

    console.log(`✅ Found transaction: ${transaction.id}, current status: ${transaction.status}`);

    // 5. Map UmunotaPay status to our internal status
    let new_status = 'failed';
    let payment_status_text = 'failed';

    if (payment_status === 'success' || payment_status === 'completed' || payment_status === 'paid' || payment_status === 'approved') {
      new_status = 'paid';
      payment_status_text = 'paid';
    } else if (payment_status === 'pending' || payment_status === 'processing') {
      new_status = 'processing';
      payment_status_text = 'unpaid';
    } else if (payment_status === 'cancelled' || payment_status === 'canceled') {
      new_status = 'failed';
      payment_status_text = 'failed';
    } else {
      new_status = 'failed';
      payment_status_text = 'failed';
    }

    // 6. Update the transaction
    await supabaseAdmin
      .from('transactions')
      .update({
        status: new_status,
        webhook_payload: payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id);

    console.log(`✅ Transaction ${transaction.id} updated to status: ${new_status}`);

    // 7. Update the redemption (order)
    await supabaseAdmin
      .from('redemptions')
      .update({
        payment_status: payment_status_text,
        status: payment_status_text === 'paid' ? 'confirmed' : 'failed',
      })
      .eq('id', transaction.redemption_id);

    // 8. Notify the merchant (if payment was successful)
    if (new_status === 'paid') {
      const merchant_id = transaction.redemptions?.merchant_id;
      if (merchant_id) {
        await supabaseAdmin
          .from('notifications')
          .insert({
            merchant_id: merchant_id,
            deal_id: transaction.redemptions?.deal_id || transaction.deal_id,
            student_name: 'Student', // We can fetch this from auth.users if needed
            student_email: 'student@email.com',
            message: `💰 Payment received for order #${transaction.redemption_id}`,
            type: 'payment_received',
            read: false,
          });
        console.log(`🔔 Notification sent to merchant ${merchant_id}`);
      }
    }

    // 9. Return a success response to UmunotaPay
    return json({ success: true, message: 'Webhook processed successfully' });

  } catch (error: any) {
    console.error('❌ Webhook error:', error.message);
    return json({ error: error instanceof Error ? error.message : 'Unexpected webhook error' }, 500);
  }
});