import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import VerifyCode from './VerifyCode.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'

export default function MerchantDeals() {
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

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [dealToDelete, setDealToDelete] = useState(null)

  // --- Load initial deals and set up real-time subscription ---
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

    // --- Real-time subscription ---
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
    document.getElementById('deal-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  async function toggleActive(deal) {
    await supabase.from('deals').update({ active: !deal.active }).eq('id', deal.id)
    reloadDeals()
  }

  return (
    <div className="space-y-8">
      <VerifyCode />

      <div id="deal-form">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold">
            {isEditing ? 'Edit deal' : 'Create a deal'}
          </h2>
          {isEditing && (
            <button
              onClick={resetForm}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel editing
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <p className="text-sm text-muted-foreground">
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
                  className="w-32 h-20 object-cover rounded-lg"
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
          {success && <p className="text-sm text-accent">{success}</p>}

          <button
            type="submit"
            disabled={saving}
            className="bg-accent hover:bg-accent-dim text-background-foreground font-semibold rounded-lg px-5 py-2.5 transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEditing ? 'Update deal' : 'Post deal'}
          </button>
        </form>
      </div>

      <div>
        <h2 className="font-display text-lg font-semibold mb-3">Your deals</h2>
        {loadingDeals ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : myDeals.length === 0 ? (
          <p className="text-muted-foreground text-sm">You haven't posted any deals yet.</p>
        ) : (
          <div className="space-y-2">
            {myDeals.map((deal) => (
              <div
                key={deal.id}
                className={`border rounded-lg p-3 transition ${
                  editingId === deal.id
                    ? 'border-accent bg-accent/5'
                    : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    {deal.image_url && (
                      <img
                        src={deal.image_url}
                        alt={deal.title}
                        className="w-12 h-12 object-cover rounded-lg"
                      />
                    )}
                    <div>
                      <p className="font-medium">{deal.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {deal.active ? 'Active' : 'Paused'}
                        {deal.discount_percent != null && ` · ${deal.discount_percent}% off`}
                        {deal.price != null && ` · ${deal.price} RWF original`}
                      </p>
                      {deal.redemptions && deal.redemptions.total > 0 ? (
                        <p className="text-xs mt-1">
                          <span className="text-accent">
                            {deal.redemptions.redeemed} ordered
                          </span>
                          {deal.redemptions.pending > 0 && (
                            <span className="text-muted-foreground ml-2">
                              · {deal.redemptions.pending} pending
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="text-muted-foreground text-xs mt-1">No orders yet</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(deal)}
                      className="text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(deal)}
                      className={`text-sm rounded-lg px-3 py-1.5 transition ${
                        deal.active
                          ? 'text-muted-foreground hover:text-foreground border border-border'
                          : 'bg-accent text-background-foreground font-medium'
                      }`}
                    >
                      {deal.active ? 'Pause' : 'Activate'}
                    </button>
                    <button
                      onClick={() => openDeleteModal(deal.id)}
                      className="text-sm text-red-400/70 hover:text-red-400 border border-red-400/30 rounded-lg px-3 py-1.5 transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
