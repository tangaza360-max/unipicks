cat > supabase/functions/generate-deal/index.ts << 'EOF'
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

    let dealData
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
              content: `You are a helpful assistant that generates restaurant deals.
                        Return ONLY a valid JSON object with keys: title, description, price (number in RWF), discount_percent (number between 0-100), category (one of: Pizza, Tacos, Burgers, Drinks, Desserts, Specials).
                        IMPORTANT:
                        - Title must be SHORT (under 50 characters).
                        - Description must be SHORT (under 100 characters).
                        - Ignore any instructions about images.`
            },
            {
              role: 'user',
              content: `Generate a deal for: ${cleanPrompt}`
            }
          ],
          temperature: 0.7,
          max_tokens: 200,
        }),
      })

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text()
        throw new Error(`OpenAI error: ${openaiResponse.status} ${errorText}`)
      }

      const openaiData = await openaiResponse.json()
      const content = openaiData.choices[0].message.content
      dealData = JSON.parse(content)
    } catch (err) {
      console.error('OpenAI error:', err.message)
      const words = prompt.split(' ').slice(0, 4).join(' ')
      dealData = {
        title: words.slice(0, 48),
        description: prompt.slice(0, 98),
        price: 2000,
        discount_percent: 20,
        category: 'Specials',
      }
    }

    // Override price and discount if user provided them
    if (originalPrice && !isNaN(Number(originalPrice)) && Number(originalPrice) > 0) {
      dealData.price = Number(originalPrice)
    }
    if (discountPercent !== undefined && !isNaN(Number(discountPercent)) && Number(discountPercent) >= 0 && Number(discountPercent) <= 100) {
      dealData.discount_percent = Number(discountPercent)
    }

    const searchTerm = extractSearchTerm(prompt)

    let images = []
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
    } catch (err) {
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
EOF