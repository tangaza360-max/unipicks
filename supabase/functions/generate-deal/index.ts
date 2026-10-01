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

function extractSearchTerm(prompt: string): string {
  const lower = prompt.toLowerCase()
  const keywords = ['taco', 'tacos', 'pizza', 'burger', 'burgers', 'drink', 'drinks', 'dessert', 'desserts', 'special', 'specials']
  for (const word of keywords) {
    if (lower.includes(word)) {
      return word
    }
  }
  const words = prompt.split(' ').slice(0, 3).join(' ')
  return words || 'food'
}

// Strips ```json ... ``` fences that OpenAI sometimes wraps around JSON
function stripMarkdownFences(text: string): string {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '')
    cleaned = cleaned.replace(/```\s*$/, '')
  }
  return cleaned.trim()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.split(' ')[1]
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { prompt, page = 1, originalPrice, discountPercent } = body
    if (!prompt || prompt.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: 'Please provide a description' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cleanPrompt = prompt
      .replace(/show images?/gi, '')
      .replace(/images? of/gi, '')
      .replace(/not restaurant interiors/gi, '')
      .trim()

    let dealData: any

    try {
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are a marketing expert for a student discount platform. Your goal is to create an attractive, concise deal offer based on a merchant's description.

You must output ONLY a valid JSON object with the following keys:
- "title": A short, catchy title (max 50 characters).
- "description": A brief, enticing description (max 100 characters).
- "offer_type": One of "percentage", "fixed_amount", "bogo", "fixed_price", "tiered", "free_shipping", "group_buy".
- "original_price": The original price of the item in RWF (number).
- "discount_value": For "percentage", use a number 0-100. For "fixed_amount", use the RWF amount. For all other types, use 0.
- "final_price": The final price the student will pay in RWF (number).
- "buy_quantity": For "bogo" only, the number of items to buy (e.g., 1). Otherwise null.
- "get_quantity": For "bogo" only, the number of items given (e.g., 1). Otherwise null.
- "min_participants": For "group_buy" only, minimum students required (e.g., 5). Otherwise null.
- "tiered_rules": For "tiered" only, a JSON array of {"min_qty": number, "price": number}. Otherwise null.
- "category": One of "Pizza", "Tacos", "Burgers", "Drinks", "Desserts", "Specials".

RULES:
- Infer offer_type from the merchant's description (e.g., "Buy 1 Get 2" -> bogo, "20% off" -> percentage, "if 5 students order" -> group_buy, "2 for 10,000" -> fixed_price, "free delivery" -> free_shipping).
- For bogo, set buy_quantity and get_quantity. For group_buy, set min_participants.
- Title must be SHORT (under 50 characters).
- Description must be SHORT (under 100 characters).
- Ignore any instructions about images.
- Do NOT include any text outside the JSON object.`
            },
            {
              role: 'user',
              content: `Generate a deal for: ${cleanPrompt}`
            }
          ],
          temperature: 0.7,
          max_tokens: 300,
        }),
      })

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text()
        throw new Error(`OpenAI error: ${openaiResponse.status} ${errorText}`)
      }

      const openaiData = await openaiResponse.json()
      const rawContent = openaiData.choices[0].message.content
      const cleanedContent = stripMarkdownFences(rawContent)
      dealData = JSON.parse(cleanedContent)

      // Validate required fields exist, else throw to trigger fallback
      if (!dealData.title || !dealData.offer_type) {
        throw new Error('OpenAI returned incomplete deal data')
      }
    } catch (err: any) {
      console.error('OpenAI error:', err.message)
      const words = prompt.split(' ').slice(0, 4).join(' ')
      dealData = {
        title: words.slice(0, 48),
        description: prompt.slice(0, 98),
        offer_type: 'percentage',
        original_price: 2000,
        discount_value: 20,
        final_price: 1600,
        buy_quantity: null,
        get_quantity: null,
        min_participants: null,
        tiered_rules: null,
        category: 'Specials',
      }
    }

    // Override original price if merchant provided it
    if (originalPrice && !isNaN(Number(originalPrice)) && Number(originalPrice) > 0) {
      dealData.original_price = Number(originalPrice)
    }

    // Override discount if merchant provided it (only for percentage type)
    if (
      discountPercent !== undefined &&
      !isNaN(Number(discountPercent)) &&
      Number(discountPercent) >= 0 &&
      Number(discountPercent) <= 100
    ) {
      if (dealData.offer_type === 'percentage') {
        dealData.discount_value = Number(discountPercent)
      }
    }

    // Recompute final_price for percentage deals so it stays consistent
    if (
      dealData.offer_type === 'percentage' &&
      typeof dealData.original_price === 'number' &&
      typeof dealData.discount_value === 'number'
    ) {
      dealData.final_price = Math.round(
        dealData.original_price * (1 - dealData.discount_value / 100)
      )
    }

    const searchTerm = extractSearchTerm(prompt)

    let images: string[] = []
    try {
      const unsplashResponse = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchTerm)}&per_page=6&orientation=squarish&page=${page}`,
        {
          headers: {
            'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`,
          },
        }
      )

      if (unsplashResponse.ok) {
        const unsplashData = await unsplashResponse.json()
        images = unsplashData.results.map((img: any) => img.urls.small)
      } else {
        images = [
          'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=400',
          'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400',
          'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
        ]
      }
    } catch (err: any) {
      console.error('Unsplash error:', err.message)
      images = [
        'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=400',
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400',
        'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
      ]
    }

    return new Response(
      JSON.stringify({
        success: true,
        deal: dealData,
        images,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})