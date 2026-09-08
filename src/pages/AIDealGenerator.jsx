// src/pages/AIDealGenerator.jsx
import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function AIDealGenerator({ onDealCreated }) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(null)
  const [selectedImage, setSelectedImage] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleGenerate(e) {
    e.preventDefault()
    if (!prompt.trim()) return

    setLoading(true)
    setError('')
    setGenerated(null)

    try {
      const response = await fetch(
        'https://dylgephsnywowxxasifs.supabase.co/functions/v1/generate-deal',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ prompt: prompt.trim() }),
        }
      )

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Generation failed')

      setGenerated(data)
      if (data.images && data.images.length > 0) {
        setSelectedImage(data.images[0])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateDeal() {
    if (!generated || !selectedImage) return

    setSaving(true)
    setError('')

    try {
      const { data: userData } = await supabase.auth.getUser()
      const { error: insertError } = await supabase.from('deals').insert({
        merchant_id: userData.user.id,
        business_name: 'Your Business',
        title: generated.deal.title,
        description: generated.deal.description,
        price: generated.deal.price,
        discount_percent: generated.deal.discount_percent,
        image_url: selectedImage,
        active: true,
      })

      if (insertError) throw new Error(insertError.message)

      setPrompt('')
      setGenerated(null)
      setSelectedImage(null)

      if (onDealCreated) onDealCreated()
      alert('🎉 Deal created successfully!')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">✨ AI Deal Generator</h2>
      <p className="text-muted-foreground text-sm">
        Describe your deal and let AI create a listing for you.
      </p>

      <form onSubmit={handleGenerate} className="space-y-3">
        <div>
          <label className="field-label">Describe your deal</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Tacos Tuesday – 20% off all tacos, every Tuesday"
            className="field-input min-h-[80px]"
            rows={3}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="w-full bg-accent text-background-foreground font-semibold rounded-lg py-3 transition disabled:opacity-50"
        >
          {loading ? 'Generating...' : '✨ Generate Deal'}
        </button>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {generated && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <h3 className="font-medium">AI Suggested Deal</h3>

          <div className="space-y-1">
            <p><span className="text-muted-foreground text-sm">Title:</span> {generated.deal.title}</p>
            <p><span className="text-muted-foreground text-sm">Description:</span> {generated.deal.description}</p>
            <p><span className="text-muted-foreground text-sm">Price:</span> {generated.deal.price} RWF</p>
            <p><span className="text-muted-foreground text-sm">Discount:</span> {generated.deal.discount_percent}%</p>
          </div>

          <div>
            <p className="text-muted-foreground text-sm mb-2">Choose an image:</p>
            <div className="grid grid-cols-3 gap-2">
              {generated.images.map((url, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedImage(url)}
                  className={`border-2 rounded-lg overflow-hidden transition ${
                    selectedImage === url ? 'border-accent' : 'border-transparent'
                  }`}
                >
                  <img src={url} alt={`Option ${index + 1}`} className="w-full h-20 object-cover" />
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreateDeal}
            disabled={saving || !selectedImage}
            className="w-full bg-primary text-primary-foreground font-semibold rounded-lg py-2.5 transition disabled:opacity-50"
          >
            {saving ? 'Creating...' : '✅ Create Deal'}
          </button>
        </div>
      )}
    </div>
  )
}