import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { isMissingPrice, offerBadge } from '../lib/dealPricing.js'
import { liveChannel } from '../lib/realtime.js'
import VerifyCode from './VerifyCode.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import { Search, Sparkles, X, Pencil, UtensilsCrossed, CheckCircle2, ShoppingCart } from 'lucide-react'
import { formatMoney } from '../lib/format.js'
import Button from '../components/Button.jsx'
import MoreActions from '../components/MoreActions.jsx'

// Shown when a business that Unipicks hasn't approved (yet, or any more)
// tries to post or change a deal.
const NOT_APPROVED_MESSAGE =
  "Your business is waiting for Unipicks to approve it. You can post deals once it's approved."

export default function MerchantDeals() {
  // --- State for deals and form ---
  const [businessName, setBusinessName] = useState('')
  // null until known; false = waiting for Unipicks to approve the business.
  const [approved, setApproved] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [offerType, setOfferType] = useState('percentage')
  const [discountPercent, setDiscountPercent] = useState('')
  const [price, setPrice] = useState('')
  const [discountValue, setDiscountValue] = useState('')
  const [buyQuantity, setBuyQuantity] = useState('1')
  const [getQuantity, setGetQuantity] = useState('1')
  const [minParticipants, setMinParticipants] = useState('5')
  const [tieredRules, setTieredRules] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [availableDays, setAvailableDays] = useState([
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ])
  const [availableFrom, setAvailableFrom] = useState('')
  const [availableUntil, setAvailableUntil] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [myDeals, setMyDeals] = useState([])
  const [groupActivity, setGroupActivity] = useState({})
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
        // The seller name comes from the business profile (the database
        // enforces this too); sign-up metadata is only a fallback.
        const { data: profile } = await supabase
          .from('merchant_profiles')
          .select('business_name, approved')
          .eq('id', userData.user.id)
          .maybeSingle()
        if (cancelled) return
        setBusinessName(profile?.business_name?.trim() || userData.user.user_metadata?.business_name || '')
        setApproved(profile ? Boolean(profile.approved) : null)
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
    loadGroupActivity()

    async function getUserId() {
      const { data: userData } = await supabase.auth.getUser()
      return userData.user?.id
    }

    getUserId().then(userId => {
      if (!userId) return

      const channel = liveChannel('merchant-deals')
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
            loadGroupActivity()
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

  const selectedDiscountPercent = Number(discountPercent)
  const enteredPrice = price === '' ? null : Number(price)
  const enteredDiscountValue = discountValue === '' ? null : Number(discountValue)
  let finalPrice = null

  if (['percentage', 'group_buy'].includes(offerType) && enteredPrice !== null) {
    finalPrice = selectedDiscountPercent > 0 ? Math.round(enteredPrice * (1 - selectedDiscountPercent / 100)) : enteredPrice
  } else if (offerType === 'fixed_amount' && enteredPrice !== null && enteredDiscountValue !== null) {
    finalPrice = Math.max(0, Math.round(enteredPrice - enteredDiscountValue))
  } else if (offerType === 'fixed_price' && enteredDiscountValue !== null) {
    finalPrice = enteredDiscountValue
  }

  function parseTieredRules(value) {
    if (!value.trim()) return []

    return value.split(',').map((rule) => {
      const match = rule.trim().match(/^(\d+)\s+for\s+(\d+(?:\.\d{1,2})?)$/i)
      if (!match) return null
      return { quantity: Number(match[1]), price: Number(match[2]) }
    })
  }

  const getOfferBadge = offerBadge

  function getOfferBadgeClass(type) {
    // One brand green for every offer (style guide §1: no purple or blue).
    return 'bg-accent text-background-foreground'
  }

  async function loadGroupActivity() {
    const { data, error: activityError } = await supabase.rpc('get_merchant_group_activity')

    if (activityError) {
      console.error('Failed to load merchant group activity:', activityError)
      setGroupActivity({})
      return
    }

    setGroupActivity((data || []).reduce((activityByDeal, activity) => {
      activityByDeal[activity.deal_id] = {
        open_group_count: activity.open_group_count,
        total_members: activity.total_members,
        total_quantity: activity.total_quantity,
      }
      return activityByDeal
    }, {}))
  }

  async function reloadDeals() {
    setLoadingDeals(true)
    loadGroupActivity()
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
    if (!businessName.trim()) return setError('Add your business name in Profile first.')

    setSaving(true)

    const { data: userData } = await supabase.auth.getUser()
    const merchantId = userData.user.id

    const [{ data: maxDiscount }, { data: maxPrice }] = await Promise.all([
      supabase.rpc('get_setting', { setting_key: 'max_discount_percent' }),
      supabase.rpc('get_setting', { setting_key: 'max_price_rwf' }),
    ])
    const maxDiscountPercent = (maxDiscount !== null && maxDiscount !== undefined && Number(maxDiscount) > 0) ? Number(maxDiscount) : 100
    const maxPriceRwf = (maxPrice !== null && maxPrice !== undefined && Number(maxPrice) > 0) ? Number(maxPrice) : 1000000
    const numericPrice = price === '' ? null : Number(price)
    const numericDiscountValue = discountValue === '' ? null : Number(discountValue)
    const tierRules = offerType === 'tiered' ? parseTieredRules(tieredRules) : []
    const requiresPrice = ['percentage', 'fixed_amount', 'bogo', 'tiered', 'group_buy'].includes(offerType)

    if (requiresPrice && (!Number.isFinite(numericPrice) || numericPrice <= 0)) {
      setSaving(false)
      setError('Enter an original price greater than 0 RWF.')
      return
    }
    if (numericPrice !== null && (!Number.isFinite(numericPrice) || numericPrice < 0)) {
      setSaving(false)
      setError('Price must be a valid amount of 0 RWF or more.')
      return
    }
    if (numericPrice !== null && numericPrice > maxPriceRwf) {
      setSaving(false)
      setError(`Price cannot exceed ${formatMoney(maxPriceRwf)}.`)
      return
    }

    if (['percentage', 'group_buy'].includes(offerType)) {
      const percent = Number(discountPercent)
      if (discountPercent !== '' && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
        setSaving(false)
        setError('Enter a discount between 0% and 100%, or leave it empty for no discount.')
        return
      }
      if (percent > maxDiscountPercent) {
        setSaving(false)
        setError(`Discount cannot exceed ${maxDiscountPercent}%.`)
        return
      }
    }

    if (['fixed_amount', 'fixed_price', 'free_shipping'].includes(offerType)) {
      const amountLabel = offerType === 'fixed_amount'
        ? 'discount amount'
        : offerType === 'fixed_price'
          ? 'bundle price'
          : 'minimum order amount'
      if (numericDiscountValue === null || !Number.isFinite(numericDiscountValue) || numericDiscountValue < 0) {
        setSaving(false)
        setError(`Enter a valid ${amountLabel} of 0 RWF or more.`)
        return
      }
      if (numericDiscountValue > maxPriceRwf) {
        setSaving(false)
        setError(`${amountLabel[0].toUpperCase()}${amountLabel.slice(1)} cannot exceed ${formatMoney(maxPriceRwf)}.`)
        return
      }
    }

    if (offerType === 'fixed_amount' && numericDiscountValue > numericPrice) {
      setSaving(false)
      setError('Discount amount cannot be greater than the original price.')
      return
    }

    if (offerType === 'bogo') {
      if (!Number.isInteger(Number(buyQuantity)) || Number(buyQuantity) < 1) {
        setSaving(false)
        setError('Buy quantity must be a whole number of at least 1.')
        return
      }
      if (!Number.isInteger(Number(getQuantity)) || Number(getQuantity) < 1) {
        setSaving(false)
        setError('Get quantity must be a whole number of at least 1.')
        return
      }
    }

    if (offerType === 'group_buy' && (!Number.isInteger(Number(minParticipants)) || Number(minParticipants) < 2)) {
      setSaving(false)
      setError('Minimum participants must be a whole number of at least 2.')
      return
    }

    if (offerType === 'tiered') {
      if (!tierRules.length || tierRules.some((rule) => !rule || rule.quantity < 1 || rule.price <= 0)) {
        setSaving(false)
        setError('Enter tier rules as quantity for price, for example: 1 for 5000, 2 for 8000.')
        return
      }
      if (tierRules.some((rule) => rule.price > maxPriceRwf)) {
        setSaving(false)
        setError(`Tier prices cannot exceed ${formatMoney(maxPriceRwf)}.`)
        return
      }
    }

    if (availableDays.length === 0) {
      setSaving(false)
      setError('Choose at least one available day.')
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

    // Empty or 0 = no discount (founder decision 2026-10-04): saved as null.
    const savedDiscountPercent = ['percentage', 'group_buy'].includes(offerType) && Number(discountPercent) > 0
      ? Number(discountPercent)
      : null
    const savedDiscountValue = {
      percentage: savedDiscountPercent,
      fixed_amount: numericDiscountValue,
      fixed_price: numericDiscountValue,
      free_shipping: numericDiscountValue,
      group_buy: savedDiscountPercent,
    }[offerType] ?? null
    const savedFinalPrice = {
      percentage: Math.round(numericPrice * (1 - (savedDiscountPercent ?? 0) / 100)),
      fixed_amount: Math.round(numericPrice - numericDiscountValue),
      fixed_price: numericDiscountValue,
      group_buy: Math.round(numericPrice * (1 - (savedDiscountPercent ?? 0) / 100)),
    }[offerType] ?? null

    const dealData = {
      merchant_id: merchantId,
      business_name: businessName.trim(),
      title: title.trim(),
      description: description.trim() || null,
      offer_type: offerType,
      discount_percent: savedDiscountPercent,
      discount_value: savedDiscountValue,
      final_price: savedFinalPrice,
      price: offerType === 'free_shipping' ? null : numericPrice,
      buy_quantity: offerType === 'bogo' ? Number(buyQuantity) : null,
      get_quantity: offerType === 'bogo' ? Number(getQuantity) : null,
      min_participants: offerType === 'group_buy' ? Number(minParticipants) : null,
      tiered_rules: offerType === 'tiered' ? tierRules : null,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      available_days: availableDays,
      available_from: availableFrom || null,
      available_until: availableUntil || null,
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
      // 42501 = the database refused it (only approved businesses may save
      // deals). Say why in plain words instead of Postgres's own message.
      if (errorResult.code === '42501') {
        setApproved(false)
        setError(NOT_APPROVED_MESSAGE)
      } else {
        setError(errorResult.message)
      }
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
    setOfferType('percentage')
    setDiscountPercent('')
    setPrice('')
    setDiscountValue('')
    setBuyQuantity('1')
    setGetQuantity('1')
    setMinParticipants('5')
    setTieredRules('')
    setExpiresAt('')
  setAvailableFrom('')
  setAvailableUntil('')
    setAvailableDays([
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ])
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
    setTitle(deal.title || '')
    setDescription(deal.description || '')
    setOfferType(deal.offer_type || 'percentage')
    setDiscountPercent((deal.discount_percent ?? (deal.offer_type === 'percentage' ? deal.discount_value : null))?.toString() || '')
    setPrice(deal.price?.toString() || '')
    setDiscountValue(deal.discount_value?.toString() || '')
    setBuyQuantity(deal.buy_quantity?.toString() || '1')
    setGetQuantity(deal.get_quantity?.toString() || '1')
    setMinParticipants(deal.min_participants?.toString() || '5')
    setTieredRules(Array.isArray(deal.tiered_rules)
      ? deal.tiered_rules.map((rule) => `${rule.quantity} for ${rule.price}`).join(', ')
      : '')
    setExpiresAt(deal.expires_at ? new Date(deal.expires_at).toISOString().split('T')[0] : '')
    setAvailableDays(deal.available_days?.length ? deal.available_days : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
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
    setOfferType('percentage')
    setDiscountValue('')
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
        {approved === false && (
          <p id="not-approved-note" role="status" className="status-wait w-full rounded-lg px-3 py-2 text-sm">
            {NOT_APPROVED_MESSAGE}
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => setShowCheckCodeModal(true)}
            className="flex min-h-11 items-center gap-2 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-lg px-4 py-2 text-sm font-medium transition"
          >
            <Search size={16} /> Check code
          </button>
          <button
            onClick={() => {
              resetForm()
              setShowCreateModal(true)
            }}
            disabled={approved === false}
            aria-describedby={approved === false ? 'not-approved-note' : undefined}
            className="flex min-h-11 items-center gap-2 bg-accent hover:bg-accent-dim text-background-foreground rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
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
          <p className="text-muted-foreground">
            {approved === false
              ? 'No deals yet. You can create your first deal once your business is approved.'
              : 'No deals yet. Create your first deal.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {myDeals.map((deal) => {
            const dealOfferType = deal.offer_type || 'percentage'
            const finalPrice = deal.final_price ?? (deal.discount_percent
              ? Math.round(deal.price * (1 - deal.discount_percent / 100))
              : deal.price)

            return (
              <div
                key={deal.id}
                className="border border-border rounded-2xl overflow-hidden bg-card shadow-sm hover:shadow-md transition-all duration-200"
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
                  {getOfferBadge(deal) && (
                    <div className={`absolute top-3 right-3 font-display font-semibold text-sm rounded-lg px-3 py-1.5 shadow-lg ${getOfferBadgeClass(dealOfferType)}`}>
                      {getOfferBadge(deal)}
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
                          ? 'bg-accent/15 text-accent'
                          : 'status-wait'
                      }`}
                    >
                      {deal.active ? 'Active' : 'Paused'}
                    </span>
                  </div>

                  {isMissingPrice(deal) && (
                    <p role="alert" className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                      Missing price. Students can't see or order this deal. Tap Edit and add the price students pay.
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs pt-2">
                    <span className="text-primary font-bold text-sm">
                      {dealOfferType === 'free_shipping'
                        ? 'Free delivery'
                        : finalPrice != null
                          ? `${formatMoney(finalPrice)}`
                          : dealOfferType === 'tiered'
                            ? 'Tiered pricing'
                            : deal.price != null
                              ? `${formatMoney(deal.price)} / item`
                              : 'View offer'}
                    </span>
                    {deal.price != null && finalPrice != null && Number(finalPrice) < Number(deal.price) && (
                      <span className="line-through text-muted-foreground">{formatMoney(deal.price)}</span>
                    )}
                  </div>

                  {dealOfferType === 'group_buy' && Number(groupActivity[deal.id]?.open_group_count) > 0 && (
                    <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                      <ShoppingCart size={14} />
                      <span>
                        {groupActivity[deal.id].open_group_count} open group{Number(groupActivity[deal.id].open_group_count) === 1 ? '' : 's'}
                        {' · '}{groupActivity[deal.id].total_members} joined
                        {' · '}{groupActivity[deal.id].total_quantity} item{Number(groupActivity[deal.id].total_quantity) === 1 ? '' : 's'}
                      </span>
                    </p>
                  )}

                  {dealOfferType === 'group_buy' &&
                    Number(groupActivity[deal.id]?.open_group_count) === 0 &&
                    deal.min_participants != null && (
                      <p className="flex items-center gap-1.5 pt-1 text-xs italic text-muted-foreground/70">
                        <ShoppingCart size={14} /> Waiting for the first group
                      </p>
                    )}

                  <div className="mt-2 flex flex-col gap-2 border-t border-border/50 pt-2">
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
                    {/* Delete sits behind "⋯" so it isn't one tap away on every card. */}
                    <div className="grid w-full grid-cols-[1fr_1fr_auto] gap-2">
                      <Button variant="secondary" onClick={() => startEdit(deal)}>
                        Edit
                      </Button>
                      <Button variant="secondary" onClick={() => toggleActive(deal)}>
                        {deal.active ? 'Pause' : 'Activate'}
                      </Button>
                      <MoreActions
                        label={`More actions for ${deal.title}`}
                        items={[{ label: 'Delete deal', danger: true, onClick: () => openDeleteModal(deal.id) }]}
                      />
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
                  <p className="field-label">Seller name</p>
                  <p className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm font-medium" aria-describedby="seller-name-help">
                    {businessName || 'Not set'}
                  </p>
                  <p id="seller-name-help" className="text-muted-foreground text-xs mt-1">
                    From your Profile. Change it there.
                  </p>
                </div>
                <div>
                  <label htmlFor="deal-title" className="field-label">Deal title</label>
                  <input
                    id="deal-title"
                    className="field-input"
                    placeholder="Tacos Tuesday"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="deal-description" className="field-label">Description</label>
                <textarea
                  id="deal-description"
                  className="field-input"
                  rows={3}
                  placeholder="20% off all tacos, every Tuesday"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="offer-type">Offer type</label>
                <select
                  id="offer-type"
                  className="field-input"
                  value={offerType}
                  onChange={(e) => {
                    setOfferType(e.target.value)
                    setDiscountValue('')
                  }}
                >
                  <option value="percentage">Percentage Discount</option>
                  <option value="fixed_amount">Fixed Amount Off</option>
                  <option value="bogo">Buy X Get Y Free</option>
                  <option value="fixed_price">Fixed Price Bundle</option>
                  <option value="tiered">Tiered Discount</option>
                  <option value="free_shipping">Free Delivery</option>
                  <option value="group_buy">Group Buy</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {offerType !== 'free_shipping' && (
                  <div>
                    <label htmlFor="deal-price" className="field-label">
                      {offerType === 'bogo' ? 'Price per item (RWF)' : offerType === 'fixed_price' ? 'Original price (RWF, optional)' : 'Price before any discount (RWF)'}
                    </label>
                    <input
                      id="deal-price"
                      className="field-input"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="2000"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </div>
                )}

                {['percentage', 'group_buy'].includes(offerType) && (
                  <div>
                    <label htmlFor="deal-discountpercent" className="field-label">Discount (%) · optional</label>
                    <input
                      id="deal-discountpercent"
                      className="field-input"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="Empty = no discount"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(e.target.value)}
                    />
                  </div>
                )}

                {offerType === 'fixed_amount' && (
                  <div>
                    <label htmlFor="deal-discountvalue" className="field-label">Discount amount (RWF)</label>
                    <input
                      id="deal-discountvalue"
                      className="field-input"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="500"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                    />
                  </div>
                )}

                {offerType === 'fixed_price' && (
                  <div>
                    <label htmlFor="deal-discountvalue-2" className="field-label">Bundle price (RWF)</label>
                    <input
                      id="deal-discountvalue-2"
                      className="field-input"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="5000"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                    />
                  </div>
                )}

                {offerType === 'free_shipping' && (
                  <div>
                    <label htmlFor="deal-discountvalue-3" className="field-label">Minimum order (RWF)</label>
                    <input
                      id="deal-discountvalue-3"
                      className="field-input"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="5000"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                    />
                  </div>
                )}

                {offerType === 'bogo' && (
                  <>
                    <div>
                      <label htmlFor="deal-buyquantity" className="field-label">Buy quantity</label>
                      <input
                        id="deal-buyquantity"
                        className="field-input"
                        type="number"
                        min="1"
                        step="1"
                        value={buyQuantity}
                        onChange={(e) => setBuyQuantity(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="deal-getquantity" className="field-label">Get quantity free</label>
                      <input
                        id="deal-getquantity"
                        className="field-input"
                        type="number"
                        min="1"
                        step="1"
                        value={getQuantity}
                        onChange={(e) => setGetQuantity(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {offerType === 'tiered' && (
                  <div className="sm:col-span-2">
                    <label htmlFor="deal-tieredrules" className="field-label">Tier rules</label>
                    <input
                      id="deal-tieredrules"
                      className="field-input"
                      type="text"
                      placeholder="1 for 5000, 2 for 8000"
                      value={tieredRules}
                      onChange={(e) => setTieredRules(e.target.value)}
                    />
                  </div>
                )}

                {offerType === 'group_buy' && (
                  <div>
                    <label htmlFor="deal-minparticipants" className="field-label">Minimum participants</label>
                    <input
                      id="deal-minparticipants"
                      className="field-input"
                      type="number"
                      min="2"
                      step="1"
                      value={minParticipants}
                      onChange={(e) => setMinParticipants(e.target.value)}
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="deal-expiresat" className="field-label">Expires on</label>
                  <input
                    id="deal-expiresat"
                    className="field-input"
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                </div>
              </div>

                        <div>
              <p id="deal-days-label" className="field-label">Available days</p>
              <div role="group" aria-labelledby="deal-days-label" className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {[
                  ['monday', 'Mon'],
                  ['tuesday', 'Tue'],
                  ['wednesday', 'Wed'],
                  ['thursday', 'Thu'],
                  ['friday', 'Fri'],
                  ['saturday', 'Sat'],
                  ['sunday', 'Sun'],
                ].map(([day, label]) => {
                  const selected = availableDays.includes(day)

                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setAvailableDays((current) =>
                          selected
                            ? current.filter((item) => item !== day)
                            : [...current, day]
                        )
                      }
                      className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                        selected
                          ? 'bg-accent text-background-foreground border-accent'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <p className="text-muted-foreground text-xs mt-1">
                Choose the days when students can use this deal.
              </p>
            </div>

          <div>
            <p id="deal-time-label" className="field-label">Available time</p>
            <div role="group" aria-labelledby="deal-time-label" className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="deal-availablefrom" className="text-xs text-muted-foreground">From</label>
                <input
                  id="deal-availablefrom"
                  type="time"
                  value={availableFrom}
                  onChange={(e) => setAvailableFrom(e.target.value)}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label htmlFor="deal-availableuntil" className="text-xs text-muted-foreground">Until</label>
                <input
                  id="deal-availableuntil"
                  type="time"
                  value={availableUntil}
                  onChange={(e) => setAvailableUntil(e.target.value)}
                  className="input-field w-full"
                />
              </div>
            </div>
            <p className="text-muted-foreground text-xs mt-1">
              Leave both empty if students can use this deal all day.
            </p>
          </div>

              <div>
                <label htmlFor="deal-photo" className="field-label">Photo</label>
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
                  id="deal-photo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-muted-foreground"
                />
                <p className="text-muted-foreground text-xs mt-1">
                  {existingImageUrl ? 'Upload a new image to replace it' : 'Upload an image for your deal'}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Student preview</p>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{businessName || 'Your business'}</p>
                    <h3 className="font-display text-lg font-semibold break-words">{title || 'Your deal title'}</h3>
                  </div>
                  <span className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold ${getOfferBadgeClass(offerType)}`}>
                    {getOfferBadge({
                      offer_type: offerType,
                      discount_value: ['percentage', 'group_buy'].includes(offerType) ? discountPercent : discountValue,
                      discount_percent: discountPercent,
                      buy_quantity: buyQuantity,
                      get_quantity: getQuantity,
                      min_participants: minParticipants,
                      final_price: finalPrice,
                    })}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-border/70 pt-3">
                  {enteredPrice !== null && ['percentage', 'fixed_amount', 'fixed_price', 'group_buy'].includes(offerType) && finalPrice !== null && finalPrice < enteredPrice && (
                    <span className="text-sm text-muted-foreground line-through">{formatMoney(enteredPrice)}</span>
                  )}
                  <span className="font-display text-xl font-bold text-primary">
                    {offerType === 'free_shipping'
                      ? 'Free delivery'
                      : finalPrice !== null
                        ? `${formatMoney(finalPrice)}`
                        : offerType === 'bogo' && enteredPrice !== null
                          ? `Pay ${formatMoney(enteredPrice * (Number(buyQuantity) || 0))} for ${Number(buyQuantity || 0) + Number(getQuantity || 0)} items`
                          : offerType === 'tiered'
                            ? (parseTieredRules(tieredRules)[0]?.price
                              ? `From ${formatMoney(parseTieredRules(tieredRules)[0].price)}`
                              : 'See tier prices')
                            : 'Deal price'}
                  </span>
                </div>
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
              <label htmlFor="deal-ai-aiprompt" className="field-label">Describe your deal</label>
              <textarea
                id="deal-ai-aiprompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g., Tacos Tuesday – 20% off all tacos, every Tuesday"
                className="field-input min-h-[80px]"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="deal-ai-aiprice" className="field-label">Original Price (RWF)</label>
                <input
                  id="deal-ai-aiprice"
                  type="number"
                  value={aiPrice}
                  onChange={(e) => setAiPrice(e.target.value)}
                  placeholder="6000"
                  className="field-input"
                />
              </div>
              <div>
                <label htmlFor="deal-ai-aidiscount" className="field-label">Discount (%)</label>
                <input
                  id="deal-ai-aidiscount"
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
                  <p><span className="text-muted-foreground">Original Price:</span> {formatMoney(aiGenerated.price)}</p>
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
