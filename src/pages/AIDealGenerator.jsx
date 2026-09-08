cat > src/pages/AIDealGenerator.jsx << 'EOF'
// src/pages/AIDealGenerator.jsx
import { useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function AIDealGenerator({ onDealCreated }) {
  const [prompt, setPrompt] = useState('')
  const [originalPrice, setOriginalPrice] = useState('')
  const [discountPercent, setDiscountPercent] = useState('')
  const [originalPrompt, setOriginalPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [generatedDeal, setGeneratedDeal] = useState(null)
  const [aiImages, setAiImages] = useState([])
  const [uploadedImages, setUploadedImages] = useState([])
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePage, setImagePage] = useState(1)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmationData, setConfirmationData] = useState(null)
  const fileInputRef = useRef(null)

  const finalPrice = originalPrice && discountPercent
    ? Math.round(Number(originalPrice) * (1 - Number(discountPercent) / 100))
    : null

  async function handleGenerate(e) {
    e.preventDefault()
    if (!prompt.trim()) return
    if (!originalPrice || Number(originalPrice) <= 0) {
      setError('Please enter a valid original price.')
      return
    }
    if (discountPercent && (Number(discountPercent) < 0 || Number(discountPercent) > 100)) {
      setError('Discount must be between 0 and 100.')
      return
    }

    setLoading(true)
    setError('')
    setGeneratedDeal(null)
    setAiImages([])
    setUploadedImages([])
    setSelectedImage(null)
    setImagePage(1)
    setShowConfirm(false)
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
          body: JSON.stringify({
            prompt: prompt.trim(),
            page: 1,
            originalPrice: Number(originalPrice),
            discountPercent: Number(discountPercent),
          }),
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
          body: JSON.stringify({
            prompt: originalPrompt,
            page: nextPage,
            originalPrice: Number(originalPrice),
            discountPercent: Number(discountPercent),
          }),
        }
      )

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Generation failed')

      setAiImages(data.images || [])
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

  function handleShowConfirmation() {
    if (!generatedDeal || !selectedImage) return

    setConfirmationData({
      title: generatedDeal.title,
      description: generatedDeal.description,
      originalPrice: Number(originalPrice),
      discountPercent: Number(discountPercent),
      finalPrice: finalPrice,
      selectedImage: selectedImage,
    })
    setShowConfirm(true)
  }

  async function handleConfirmDeal() {
    if (!confirmationData) return

    setSaving(true)
    setError('')

    try {
      const { data: userData } = await supabase.auth.getUser()
      const { error: insertError } = await supabase.from('deals').insert({
        merchant_id: userData.user.id,
        business_name: 'Your Business',
        title: confirmationData.title,
        description: confirmationData.description,
        price: confirmationData.originalPrice,
        discount_percent: confirmationData.discountPercent,
        image_url: confirmationData.selectedImage,
        active: true,
      })

      if (insertError) throw new Error(insertError.message)

      setPrompt('')
      setOriginalPrice('')
      setDiscountPercent('')
      setOriginalPrompt('')
      setGeneratedDeal(null)
      setAiImages([])
      setUploadedImages([])
      setSelectedImage(null)
      setImagePage(1)
      setShowConfirm(false)
      setConfirmationData(null)

      if (onDealCreated) onDealCreated()
      alert('🎉 Deal created successfully!')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const allImages = [...aiImages, ...uploadedImages]

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">✨ AI Deal Generator</h2>
      <p className="text-muted-foreground text-sm">
        Describe your deal, set the price and discount, and let AI create a listing for you.
      </p>

      <form onSubmit={handleGenerate} className="space-y-3">
        <div>
          <label className="field-label">Describe your deal</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Tacos Tuesday – 20% off all tacos, every Tuesday"
            className="field-input min-h-[80px]"
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Original Price (RWF)</label>
            <input
              type="number"
              value={originalPrice}
              onChange={(e) => setOriginalPrice(e.target.value)}
              placeholder="6000"
              className="field-input"
              required
            />
          </div>
          <div>
            <label className="field-label">Discount (%)</label>
            <input
              type="number"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              placeholder="20"
              className="field-input"
              min="0"
              max="100"
            />
          </div>
        </div>

        {finalPrice !== null && Number(originalPrice) > 0 && (
          <p className="text-sm text-muted-foreground">
            Final price: <span className="text-primary font-bold">{finalPrice} RWF</span>
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !prompt.trim() || !originalPrice}
          className="w-full bg-accent text-background-foreground font-semibold rounded-lg py-3 transition disabled:opacity-50"
        >
          {loading ? 'Generating...' : '✨ Generate Deal'}
        </button>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {generatedDeal && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <h3 className="font-medium">AI Suggested Deal</h3>

          <div className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Title:</span> {generatedDeal.title}</p>
            <p><span className="text-muted-foreground">Description:</span> {generatedDeal.description}</p>
            <p><span className="text-muted-foreground">Original Price:</span> {generatedDeal.price} RWF</p>
            <p><span className="text-muted-foreground">Discount:</span> {generatedDeal.discount_percent}%</p>
            <p><span className="text-muted-foreground">Final Price:</span> <span className="text-primary font-bold">{finalPrice || generatedDeal.price} RWF</span></p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-muted-foreground text-sm">Choose an image:</p>
              <div className="flex gap-2">
                <button
                  onClick={handleRegenerateImages}
                  disabled={loading || !originalPrompt}
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
            onClick={handleShowConfirmation}
            disabled={!selectedImage}
            className="w-full bg-primary text-primary-foreground font-semibold rounded-lg py-2.5 transition disabled:opacity-50"
          >
            Review & Confirm
          </button>
        </div>
      )}

      {showConfirm && confirmationData && (
        <div className="border border-green-500/50 bg-green-500/5 rounded-lg p-5 space-y-4 mt-2">
          <h3 className="font-display text-xl font-semibold text-green-600">📋 Confirm Your Deal</h3>
          <p className="text-sm text-muted-foreground">Review the details below before posting.</p>

          <div className="space-y-2 text-sm bg-card/40 p-3 rounded border border-border">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Title</span>
              <span className="font-medium">{confirmationData.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Description</span>
              <span className="font-medium text-right max-w-[60%]">{confirmationData.description}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Original Price</span>
              <span className="font-medium">{confirmationData.originalPrice} RWF</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="font-medium">{confirmationData.discountPercent}%</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 mt-1">
              <span className="text-muted-foreground font-semibold">Final Price</span>
              <span className="font-bold text-primary text-lg">{confirmationData.finalPrice} RWF</span>
            </div>
            <div className="flex justify-center mt-2">
              <img
                src={confirmationData.selectedImage}
                alt="Selected deal image"
                className="w-24 h-24 object-cover rounded-lg border border-border"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 border border-border text-muted-foreground hover:text-foreground rounded-lg py-2.5 transition"
            >
              Edit
            </button>
            <button
              onClick={handleConfirmDeal}
              disabled={saving}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg py-2.5 transition disabled:opacity-50"
            >
              {saving ? 'Posting...' : '✅ Confirm & Post Deal'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
EOF