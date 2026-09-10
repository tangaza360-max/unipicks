import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import VerifyCode from './VerifyCode.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import { Search, Sparkles, X, Pencil, UtensilsCrossed, CheckCircle2 } from 'lucide-react'

export default function MerchantDeals() {
  // --- State for deals and form ---
  const [businessName, setBusinessName] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [discountPercent, setDiscountPercent] = useState('')
  const [price, setPrice] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [myDeals, setMyDeals] = useState([])
  const [loadingDeals, setLoadingDeals] = useState(true)

  const [editingId, setEditingId] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [existingImageUrl, setExistingImageUrl] = useState(null)

  // --- Modal states ---
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showCheckCodeModal, setShowCheckCodeModal] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [dealToDelete, setDealToDelete] = useState(null)

  // --- AI Generator state (full screen) ---
  const [showAIFullScreen, setShowAIFullScreen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiPrice, setAiPrice] = useState('')
  const [aiDiscount, setAiDiscount] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiGenerated, setAiGenerated] = useState(null)
  const [aiImages, setAiImages] = useState([])
  const [aiSelectedImage, setAiSelectedImage] = useState(null)

  // --- Load deals and real‑time subscription ---
  useEffect(() => {
    let cancelled = false
    let userId = null

    async function loadDeals() {
      const { data: userData } = await supabase.auth.getUser()
      userId = userData.user?.id

      if (userData.user) {
        setBusinessName(userData.user.user_metadata?.business_name ?? '')
      }

      const { data, error: fetchError } = await supabase
        .from('deals')
        .select('*')
        .eq('merchant_id', userId)
        .order('created_at', { ascending: false })

      if (fetchError) {
        setError(fetchError.message)
        setLoadingDeals(false)
        return
      }

      const dealIds = data?.map(d => d.id) || []
      let redemptionCounts = {}
      if (dealIds.length > 0) {
        const { data: redemptions, error: redemptionError } = await supabase
          .from('redemptions')
          .select('deal_id, status')
          .in('deal_id', dealIds)

        if (!redemptionError) {
          redemptionCounts = redemptions.reduce((acc, r) => {
            if (!acc[r.deal_id]) acc[r.deal_id] = { total: 0, redeemed: 0, pending: 0 }
            acc[r.deal_id].total++
            if (r.status === 'redeemed') acc[r.deal_id].redeemed++
            else acc[r.deal_id].pending++
            return acc
          }, {})
        }
      }

      const dealsWithStats = data?.map(deal => ({
        ...deal,
        redemptions: redemptionCounts[deal.id] || { total: 0, redeemed: 0, pending: 0 }
      })) || []

      if (!cancelled) {
        setMyDeals(dealsWithStats)
        setLoadingDeals(false)
      }
    }

    loadDeals()

    async function getUserId() {
      const { data: userData } = await supabase.auth.getUser()
      return userData.user?.id
    }

    getUserId().then(userId => {
      if (!userId) return

      const channel = supabase
        .channel('merchant-deals')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'deals',
            filter: `merchant_id=eq.${userId}`,
          },
          () => {
            loadDeals()
          }
        )
        .subscribe()

      return () => {
        cancelled = true
        channel.unsubscribe()
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const finalPrice =
    price && discountPercent
      ? Math.round(Number(price) * (1 - Number(discountPercent) / 100))
      : null

  async function reloadDeals() {
    setLoadingDeals(true)
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id

    const { data, error: fetchError } = await supabase
      .from('deals')
      .select('*')
      .eq('merchant_id', userId)
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
      setLoadingDeals(false)
      return
    }

    const dealIds = data?.map(d => d.id) || []
    let redemptionCounts = {}
    if (dealIds.length > 0) {
      const { data: redemptions, error: redemptionError } = await supabase
        .from('redemptions')
        .select('deal_id, status')
        .in('deal_id', dealIds)

      if (!redemptionError) {
        redemptionCounts = redemptions.reduce((acc, r) => {
          if (!acc[r.deal_id]) acc[r.deal_id] = { total: 0, redeemed: 0, pending: 0 }
          acc[r.deal_id].total++
          if (r.status === 'redeemed') acc[r.deal_id].redeemed++
          else acc[r.deal_id].pending++
          return acc
        }, {})
      }
    }

    const dealsWithStats = data?.map(deal => ({
      ...deal,
      redemptions: redemptionCounts[deal.id] || { total: 0, redeemed: 0, pending: 0 }
    })) || []

    setMyDeals(dealsWithStats)
    setLoadingDeals(false)
  }

  // --- Delete handlers ---
  function openDeleteModal(dealId) {
    setDealToDelete(dealId)
    setDeleteModalOpen(true)
  }

  async function confirmDeleteDeal() {
    if (!dealToDelete) return

    const { error: deleteError } = await supabase
      .from('deals')
      .delete()
      .eq('id', dealToDelete)

    setDeleteModalOpen(false)
    setDealToDelete(null)

    if (deleteError) {
      setError(deleteError.message)
    } else {
      setSuccess('Deal deleted successfully!')
      reloadDeals()
    }
  }

  // --- Submit create/edit ---
  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!title.trim()) return setError('Give the deal a title.')
    if (!businessName.trim()) return setError('Business name is missing.')

    setSaving(true)

    const { data: userData } = await supabase.auth.getUser()
    const merchantId = userData.user.id

    const [{ data: maxDiscount }, { data: maxPrice }] = await Promise.all([
      supabase.rpc('get_setting', { setting_key: 'max_discount_percent' }),
      supabase.rpc('get_setting', { setting_key: 'max_price_rwf' }),
    ])
    const maxDiscountPercent = Number(maxDiscount)
    const maxPriceRwf = Number(maxPrice)
    if (Number.isFinite(maxDiscountPercent) && Number(discountPercent) > maxDiscountPercent) {
      setSaving(false)
      setError(`Discount cannot exceed ${maxDiscountPercent}%.`)
      return
    }
    if (Number.isFinite(maxPriceRwf) && Number(price) > maxPriceRwf) {
      setSaving(false)
      setError(`Price cannot exceed ${maxPriceRwf.toLocaleString()} RWF.`)
      return
    }

    let imageUrl = existingImageUrl

    if (imageFile) {
      const path = `${merchantId}/${Date.now()}-${imageFile.name}`
      const { error: uploadError } = await supabase.storage
        .from('deal-images')
        .upload(path, imageFile)

      if (uploadError) {
        setSaving(false)
        setError(`Image upload failed: ${uploadError.message}`)
        return
      }
      const { data: publicUrlData } = supabase.storage.from('deal-images').getPublicUrl(path)
      imageUrl = publicUrlData.publicUrl
    }

    const dealData = {
      merchant_id: merchantId,
      business_name: businessName.trim(),
      title: title.trim(),
      description: description.trim() || null,
      discount_percent: discountPercent ? Number(discountPercent) : null,
      price: price ? Number(price) : null,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      image_url: imageUrl,
    }

    let errorResult

    if (isEditing && editingId) {
      const { error: updateError } = await supabase
        .from('deals')
        .update(dealData)
        .eq('id', editingId)
      errorResult = updateError
    } else {
      const { error: insertError } = await supabase.from('deals').insert({
        ...dealData,
        active: true,
      })
      errorResult = insertError
    }

    setSaving(false)

    if (errorResult) {
      setError(errorResult.message)
      return
    }

    setSuccess(isEditing ? 'Deal updated successfully!' : 'Deal created successfully!')
    resetForm()
    reloadDeals()
    setShowCreateModal(false)
  }

  function resetForm() {
    setTitle('')
    setDescription('')
    setDiscountPercent('')
    setPrice('')
    setExpiresAt('')
    setImageFile(null)
    setExistingImageUrl(null)
    setEditingId(null)
    setIsEditing(false)
    setError('')
    setSuccess('')
    // Reset AI state when closing
    setAiPrompt('')
    setAiPrice('')
    setAiDiscount('')
    setAiGenerated(null)
    setAiImages([])
    setAiSelectedImage(null)
  }

  function startEdit(deal) {
    setEditingId(deal.id)
    setIsEditing(true)
    setBusinessName(deal.business_name || '')
    setTitle(deal.title || '')
    setDescription(deal.description || '')
    setDiscountPercent(deal.discount_percent?.toString() || '')
    setPrice(deal.price?.toString() || '')
    setExpiresAt(deal.expires_at ? new Date(deal.expires_at).toISOString().split('T')[0] : '')
    setExistingImageUrl(deal.image_url || null)
    setImageFile(null)
    setError('')
    setSuccess('')
    setShowCreateModal(true)
  }

  async function toggleActive(deal) {
    await supabase.from('deals').update({ active: !deal.active }).eq('id', deal.id)
    reloadDeals()
  }

  // --- AI Generator functions ---
  async function handleAIGenerate() {
    if (!aiPrompt.trim()) {
      setError('Please describe your deal')
      return
    }
    setAiLoading(true)
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
            prompt: aiPrompt.trim(),
            page: 1,
            originalPrice: Number(aiPrice) || 0,
            discountPercent: Number(aiDiscount) || 0,
          }),
        }
      )

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Generation failed')

      setAiGenerated(data.deal)
      setAiImages(data.images || [])
      if (data.images && data.images.length > 0) {
        setAiSelectedImage(data.images[0])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setAiLoading(false)
    }
  }

  function applyAIDeal() {
    if (!aiGenerated) return
    setTitle(aiGenerated.title || '')
    setDescription(aiGenerated.description || '')
    if (aiPrice) setPrice(aiPrice)
    else if (aiGenerated.price) setPrice(aiGenerated.price.toString())
    if (aiDiscount) setDiscountPercent(aiDiscount)
    else if (aiGenerated.discount_percent) setDiscountPercent(aiGenerated.discount_percent.toString())
    if (aiSelectedImage) {
      setExistingImageUrl(aiSelectedImage)
    }
    // Close the full-screen AI modal
    setShowAIFullScreen(false)
    // Show a success message
    setSuccess('AI deal applied! You can tweak the fields before saving.')
  }

  // --- Render ---
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">Your Deals</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCheckCodeModal(true)}
            className="flex items-center gap-2 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-lg px-4 py-2 text-sm font-medium transition"
          >
            <Search size={16} /> Check code
          </button>
          <button
            onClick={() => {
              resetForm()
              setShowCreateModal(true)
            }}
            className="flex items-center gap-2 bg-accent hover:bg-accent-dim text-background-foreground rounded-lg px-4 py-2 text-sm font-medium transition"
          >
            <Sparkles size={16} /> Create deal
          </button>
        </div>
      </div>

      {/* Deal grid */}
      {loadingDeals ? (
        <p className="text-muted-foreground text-sm">Loading deals…</p>
      ) : myDeals.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-xl">
          <p className="text-muted-foreground">No deals yet. Create your first deal!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {myDeals.map((deal) => {
            const finalPrice = deal.discount_percent
              ? Math.round(deal.price * (1 - deal.discount_percent / 100))
              : deal.price

            return (
              <div
                key={deal.id}
                className="border border-border rounded-xl overflow-hidden bg-card shadow-sm hover:shadow-md transition-all duration-200"
              >
                <div className="relative h-40 w-full">
                  {deal.image_url ? (
                    <img src={deal.image_url} alt={deal.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-accent/30 via-muted to-card flex items-center justify-center">
                      <UtensilsCrossed size={36} className="text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" />
                  {deal.discount_percent != null && (
                    <div className="absolute top-3 right-3 bg-accent text-background-foreground font-display font-semibold text-sm rounded-lg px-3 py-1.5 shadow-lg">
                      {deal.discount_percent}% off
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wide">{deal.business_name}</p>
                      <h3 className="font-display font-semibold text-lg">{deal.title}</h3>
                      {deal.description && (
                        <p className="text-muted-foreground text-sm line-clamp-2">{deal.description}</p>
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        deal.active
                          ? 'bg-green-500/20 text-green-700'
                          : 'bg-yellow-500/20 text-yellow-700'
                      }`}
                    >
                      {deal.active ? 'Active' : 'Paused'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs pt-2">
                    <span className="text-primary font-bold text-sm">{finalPrice} RWF</span>
                    {deal.discount_percent != null && (
                      <span className="line-through text-muted-foreground">{deal.price} RWF</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                    <div>
                      {deal.redemptions && deal.redemptions.total > 0 ? (
                        <p className="text-xs">
                          <span className="text-accent">{deal.redemptions.redeemed} ordered</span>
                          {deal.redemptions.pending > 0 && (
                            <span className="text-muted-foreground ml-2">
                              · {deal.redemptions.pending} pending
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="text-muted-foreground text-xs">No orders yet</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(deal)}
                        className="text-xs bg-muted/40 hover:bg-muted text-foreground rounded-lg px-3 py-1.5 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(deal)}
                        className={`text-xs rounded-lg px-3 py-1.5 transition ${
                          deal.active
                            ? 'bg-yellow-500/20 text-yellow-700 hover:bg-yellow-500/30'
                            : 'bg-green-500/20 text-green-700 hover:bg-green-500/30'
                        }`}
                      >
                        {deal.active ? 'Pause' : 'Activate'}
                      </button>
                      <button
                        onClick={() => openDeleteModal(deal.id)}
                        className="text-xs bg-red-500/10 text-red-600 hover:bg-red-500/20 rounded-lg px-3 py-1.5 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* --- Create/Edit Modal --- */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 animate-in zoom-in-95 fade-in duration-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                {isEditing ? <><Pencil size={18} /> Edit deal</> : <><Sparkles size={18} /> Create a new deal</>}
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>

            {/* Button to open full-screen AI generator */}
            <button
              onClick={() => {
                // Reset AI state when opening
                setAiPrompt('')
                setAiPrice('')
                setAiDiscount('')
                setAiGenerated(null)
                setAiImages([])
                setAiSelectedImage(null)
                setError('')
                setShowAIFullScreen(true)
              }}
              className="mb-4 text-sm bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 rounded-lg px-4 py-2 transition flex items-center gap-2"
            >
              <Sparkles size={16} /> Generate with AI (full page)
            </button>

            {/* Main Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Business name</label>
                  <input
                    className="field-input"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Deal title</label>
                  <input
                    className="field-input"
                    placeholder="Tacos Tuesday"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="field-label">Description</label>
                <textarea
                  className="field-input"
                  rows={3}
                  placeholder="20% off all tacos, every Tuesday"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="field-label">Original price (RWF)</label>
                  <input
                    className="field-input"
                    type="number"
                    min="0"
                    placeholder="2000"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Discount %</label>
                  <input
                    className="field-input"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="20"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Expires on</label>
                  <input
                    className="field-input"
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                </div>
              </div>

              {finalPrice != null && (
                <p className="text-sm text-muted-foreground bg-muted/20 p-2 rounded-lg border border-border">
                  Students will see: <span className="line-through text-muted-foreground">{price} RWF</span>{' '}
                  <span className="text-accent font-semibold">{finalPrice} RWF</span>
                </p>
              )}

              <div>
                <label className="field-label">Photo</label>
                {existingImageUrl && (
                  <div className="mb-2">
                    <img
                      src={existingImageUrl}
                      alt="Current deal image"
                      className="w-24 h-16 object-cover rounded-lg border border-border"
                    />
                    <p className="text-muted-foreground text-xs mt-1">Current image</p>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-muted-foreground"
                />
                <p className="text-muted-foreground text-xs mt-1">
                  {existingImageUrl ? 'Upload a new image to replace it' : 'Upload an image for your deal'}
                </p>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}
              {success && <p className="text-sm text-green-400">{success}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-accent hover:bg-accent-dim text-background-foreground font-semibold rounded-lg py-2.5 transition disabled:opacity-50"
                >
                  {saving ? 'Saving…' : isEditing ? 'Update Deal' : 'Post Deal'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 border border-border text-muted-foreground hover:text-foreground rounded-lg py-2.5 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Full-Screen AI Generator Modal --- */}
      {showAIFullScreen && (
        <div className="fixed inset-0 z-[60] bg-card flex flex-col animate-in fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20">
            <h2 className="font-display text-xl font-semibold flex items-center gap-2">
              <Sparkles size={18} /> AI deal generator
            </h2>
            <button
              onClick={() => setShowAIFullScreen(false)}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full space-y-4">
            <p className="text-muted-foreground text-sm">
              Describe your deal, set the price and discount, and let AI create a listing for you.
            </p>

            <div>
              <label className="field-label">Describe your deal</label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
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
                  value={aiPrice}
                  onChange={(e) => setAiPrice(e.target.value)}
                  placeholder="6000"
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Discount (%)</label>
                <input
                  type="number"
                  value={aiDiscount}
                  onChange={(e) => setAiDiscount(e.target.value)}
                  placeholder="20"
                  className="field-input"
                  min="0"
                  max="100"
                />
              </div>
            </div>

            <button
              onClick={handleAIGenerate}
              disabled={aiLoading}
              className="w-full bg-accent hover:bg-accent-dim text-background-foreground font-semibold rounded-lg py-3 transition disabled:opacity-50"
            >
              {aiLoading ? (
                'Generating...'
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Sparkles size={16} /> Generate deal
                </span>
              )}
            </button>

            {error && <p className="text-sm text-red-400">{error}</p>}

            {aiGenerated && (
              <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/10">
                <h3 className="font-medium">AI Suggested Deal</h3>
                <div className="space-y-1 text-sm">
                  <p><span className="text-muted-foreground">Title:</span> {aiGenerated.title}</p>
                  <p><span className="text-muted-foreground">Description:</span> {aiGenerated.description}</p>
                  <p><span className="text-muted-foreground">Original Price:</span> {aiGenerated.price} RWF</p>
                  <p><span className="text-muted-foreground">Discount:</span> {aiGenerated.discount_percent}%</p>
                </div>

                {aiImages.length > 0 && (
                  <div>
                    <p className="text-muted-foreground text-sm">Choose an image:</p>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {aiImages.map((url, idx) => (
                        <button
                          key={idx}
                          onClick={() => setAiSelectedImage(url)}
                          className={`border-2 rounded-lg overflow-hidden transition ${
                            aiSelectedImage === url ? 'border-accent ring-2 ring-accent/30' : 'border-transparent'
                          }`}
                        >
                          <img src={url} alt="AI suggestion" className="w-full h-20 object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={applyAIDeal}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold rounded-lg py-2.5 transition"
                >
                  <CheckCircle2 size={16} /> Apply to deal
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- Check Code Modal --- */}
      {showCheckCodeModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 fade-in duration-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                <Search size={18} /> Check student code
              </h2>
              <button
                onClick={() => setShowCheckCodeModal(false)}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>
            <VerifyCode />
            <button
              onClick={() => setShowCheckCodeModal(false)}
              className="mt-4 w-full border border-border text-muted-foreground hover:text-foreground rounded-lg py-2.5 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* --- Delete Confirmation Modal --- */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false)
          setDealToDelete(null)
        }}
        onConfirm={confirmDeleteDeal}
        title="Delete this deal?"
        message="This action cannot be undone. The deal will be permanently removed from your list."
        confirmText="Yes, delete"
        cancelText="Cancel"
        confirmVariant="danger"
      />
    </div>
  )
}
