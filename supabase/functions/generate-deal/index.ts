// @ts-nocheck
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

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || ''
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

const dealSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short catchy title (max 50 chars)" },
    description: { type: "string", description: "Brief enticing description (max 100 chars)" },
    offer_type: {
      type: "string",
      enum: ["percentage", "fixed_amount", "bogo", "fixed_price", "tiered", "free_shipping", "group_buy"]
    },
    original_price: { type: "number", description: "Original price in RWF" },
    discount_value: { type: "number", description: "Percentage (0-100) or fixed RWF amount. Use 0 for other types." },
    final_price: { type: "number", description: "Final price student pays in RWF" },
    buy_quantity: { type: "integer", description: "For BOGO only. Null otherwise." },
    get_quantity: { type: "integer", description: "For BOGO only. Null otherwise." },
    min_participants: { type: "integer", description: "For group_buy only. Null otherwise." },
    tiered_rules: {
      type: "array",
      description: "For tiered only. Null otherwise.",
      items: {
        type: "object",
        properties: {
          min_qty: { type: "integer" },
          price: { type: "number" }
        },
        required: ["min_qty", "price"]
      }
    },
    category: { type: "string", enum: ["Pizza", "Tacos", "Burgers", "Drinks", "Desserts", "Specials"] }
  },
  required: ["title", "description", "offer_type", "original_price", "discount_value", "final_price", "category"]
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
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [{ text: `Create a student deal from this merchant description: "${cleanPrompt}"` }]
            }],
            systemInstruction: {
              parts: [{
                text: `You are a marketing expert for a student discount platform. Create an attractive, concise deal offer based on a merchant's description.

RULES:
- Infer offer_type from the merchant's description (e.g., "Buy 1 Get 2" -> bogo, "20% off" -> percentage, "if 5 students order" -> group_buy, "2 for 10,000" -> fixed_price, "free delivery" -> free_shipping).
- For bogo, set buy_quantity and get_quantity. For group_buy, set min_participants.
- Title must be SHORT (under 50 characters) and creative.
- Description must be SHORT (under 100 characters).
- Ignore any instructions about images.
- Do NOT include any text outside the JSON object.`
              }]
            },
            generationConfig: {
              response_mime_type: "application/json",
              response_schema: dealSchema,
              temperature: 0.7,
              maxOutputTokens: 500
            }
          })
        }
      )

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text()
        throw new Error(`Gemini error: ${geminiResponse.status} ${errorText}`)
      }

      const geminiData = await geminiResponse.json()
      const rawContent = geminiData.candidates[0].content.parts[0].text
      dealData = JSON.parse(rawContent)

      if (!dealData.title || !dealData.offer_type) {
        throw new Error('Gemini returned incomplete deal data')
      }
    } catch (err: any) {
      console.error('Gemini error:', err.message)
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

    if (originalPrice && !isNaN(Number(originalPrice)) && Number(originalPrice) > 0) {
      dealData.original_price = Number(originalPrice)
    }

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