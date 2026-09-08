// supabase/functions/generate-deal/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || ''
const UNSPLASH_ACCESS_KEY = Deno.env.get('UNSPLASH_ACCESS_KEY') || ''

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // 1. Authenticate merchant
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.split(' ')[1]
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Parse request
    const body = await req.json()
    const { prompt } = body
    if (!prompt || prompt.trim().length < 3) {
      return new Response(JSON.stringify({ error: 'Please provide a description' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Call OpenAI to generate deal details
    // 🔧 Replace with your actual OpenAI call
    const dealData = {
      title: `${prompt} Special`,
      description: prompt,
      price: 2000,
      discount_percent: 20,
      category: 'Specials',
    }

    // 4. Call Unsplash to get images
    // 🔧 Replace with your actual Unsplash call
    const images = [
      'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=400',
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400',
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
    ]

    return new Response(
      JSON.stringify({
        success: true,
        deal: dealData,
        images,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})