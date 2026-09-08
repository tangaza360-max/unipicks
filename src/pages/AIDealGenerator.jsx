// src/pages/AIDealGenerator.jsx
import { useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function AIDealGenerator({ onDealCreated }) {
  const [prompt, setPrompt] = useState('')
  const [originalPrompt, setOriginalPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [generatedDeal, setGeneratedDeal] = useState(null)
  const [aiImages, setAiImages] = useState([])          // AI-generated images
  const [uploadedImages, setUploadedImages] = useState([]) // User-uploaded images
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePage, setImagePage] = useState(1)          // <--- NEW: track page
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  // --- Generate Deal (AI) ---
  async function handleGenerate(e) {
    e.preventDefault()
    if (!prompt.trim()) return

    setLoading(true)
    setError('')
    setGeneratedDeal(null)
    setAiImages([])
    setUploadedImages([])
    setSelectedImage(null)
    setImagePage(1)  // Reset to page 1
    setOriginalPrompt(prompt.trim())

    try {
      const response = await fetch(
        'https://dylgephsnywowxxasifs.supabase.co/functions/v1/generate-deal',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ prompt: prompt.trim(), page: 1 }),
        }
      )

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Generation failed')

      setGeneratedDeal(data.deal)
      setAiImages(data.images || [])
      if (data.images && data.images.length > 0) {
        setSelectedImage(data.images[0])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // --- Regenerate ONLY images (keeping deal data) ---
  async function handleRegenerateImages() {
    if (!originalPrompt) return
    const nextPage = imagePage + 1
    setImagePage(nextPage)
    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        'https://dylgephsnywowxxasifs.supabase.co/functions/v1/generate-deal',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ prompt: originalPrompt, page: nextPage }),
        }
      )

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Generation failed')

      // Replace ONLY the AI images, keep uploaded images
      setAiImages(data.images || [])
      // If no image is selected, or selected image was AI, select the first new AI image
      if (data.images && data.images.length > 0) {
        const isSelectedFromAi = selectedImage && aiImages.includes(selectedImage)
        if (isSelectedFromAi || !selectedImage) {
          setSelectedImage(data.images[0])
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // --- Upload custom image ---
  async function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return

    setUploading(true)
    setError('')

    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not authenticated')

      const fileExt = file.name.split('.').pop()
      const filePath = `merchants/${userData.user.id}/${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('deal-images')
        .upload(filePath, file)

      if (uploadError) throw new Error(uploadError.message)

      const { data: { publicUrl } } = supabase.storage
        .from('deal-images')
        .getPublicUrl(filePath)

      // Add to uploaded images
      setUploadedImages((prev) => [...prev, publicUrl])
      setSelectedImage(publicUrl)

      if (!generatedDeal) {
        setError('Image uploaded! Generate a deal to complete the listing.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // --- Create Deal ---
  async function handleCreateDeal() {
    if (!generatedDeal || !selectedImage) return

    setSaving(true)
    setError('')

    try {
      const { data: userData } = await supabase.auth.getUser()
      const { error: insertError } = await supabase.from('deals').insert({
        merchant_id: userData.user.id,
        business_name: 'Your Business',
        title: generatedDeal.title,
        description: generatedDeal.description,
        price: generatedDeal.price,
        discount_percent: generatedDeal.discount_percent,
        image_url: selectedImage,
        active: true,
      })

      if (insertError) throw new Error(insertError.message)

      setPrompt('')
      setOriginalPrompt('')
      setGeneratedDeal(null)
      setAiImages([])
      setUploadedImages([])
      setSelectedImage(null)
      setImagePage(1)

      if (onDealCreated) onDealCreated()
      alert('🎉 Deal created successfully!')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Combine images for display
  const allImages = [...aiImages, ...uploadedImages]

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

      {generatedDeal && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <h3 className="font-medium">AI Suggested Deal</h3>

          <div className="space-y-1">
            <p><span className="text-muted-foreground text-sm">Title:</span> {generatedDeal.title}</p>
            <p><span className="text-muted-foreground text-sm">Description:</span> {generatedDeal.description}</p>
            <p><span className="text-muted-foreground text-sm">Price:</span> {generatedDeal.price} RWF</p>
            <p><span className="text-muted-foreground text-sm">Discount:</span> {generatedDeal.discount_percent}%</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-muted-foreground text-sm">Choose an image:</p>
              <div className="flex gap-2">
                <button
                  onClick={handleRegenerateImages}
                  disabled={loading || !originalPrompt || aiImages.length === 0}
                  className="text-xs bg-muted hover:bg-muted/80 text-foreground border border-border rounded-lg px-3 py-1 transition disabled:opacity-50"
                >
                  {loading ? 'Loading...' : '🔄 Regenerate'}
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-xs bg-muted hover:bg-muted/80 text-foreground border border-border rounded-lg px-3 py-1 transition disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : '📤 Upload'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
            </div>

            {allImages.length === 0 ? (
              <p className="text-muted-foreground text-sm">No images yet. Generate or upload one.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {allImages.map((url, index) => {
                  const isAi = aiImages.includes(url)
                  return (
                    <button
                      key={index}
                      onClick={() => setSelectedImage(url)}
                      className={`border-2 rounded-lg overflow-hidden transition relative ${
                        selectedImage === url ? 'border-accent ring-2 ring-accent/30' : 'border-transparent'
                      }`}
                    >
                      <img src={url} alt={`Option ${index + 1}`} className="w-full h-20 object-cover" />
                      {isAi && (
                        <span className="absolute bottom-0 right-0 bg-black/50 text-white text-[8px] px-1 rounded-tl">
                          AI
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            {aiImages.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Page {imagePage} · AI images</p>
            )}
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