function DealCard({ deal, ratingStats }) {
  const navigate = useNavigate()
  const [ordering, setOrdering] = useState(false)
  const [error, setError] = useState('')
  const [transactionId, setTransactionId] = useState(null)
  const [paymentStatus, setPaymentStatus] = useState(null)

  const expiresLabel = deal.expires_at
    ? new Date(deal.expires_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null

  const finalPrice = finalPriceOf(deal)
  const hasDiscount = deal.discount_percent != null && deal.price != null

  // --- NEW: Handle order with payment ---
  async function handleOrderWithPayment() {
    setOrdering(true)
    setError('')

    try {
      // 1. Get the logged-in user
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw new Error(userError.message)
      if (!userData.user) throw new Error('You must be logged in to order')

      // 2. Create a redemption (order) with status 'pending'
      const newCode = makeCode()
      const { data: redemptionData, error: insertError } = await supabase
        .from('redemptions')
        .insert({
          deal_id: deal.id,
          student_id: userData.user.id,
          student_name: userData.user.user_metadata?.full_name ?? userData.user.email,
          code: newCode,
          status: 'pending', // pending until payment is confirmed
          payment_status: 'unpaid',
        })
        .select('id')
        .single()

      if (insertError) throw new Error(insertError.message)
      if (!redemptionData) throw new Error('Failed to create order')

      const redemption_id = redemptionData.id

      // 3. Get the student's phone number (optional – for UmunotaPay)
      const phone = userData.user.user_metadata?.phone || ''

      // 4. Get the final price (or use deal.price)
      const amount = finalPrice !== null ? finalPrice : deal.price

      // 5. Call the process-payment Edge Function
      const response = await fetch(
        'https://dylgephsnywowxxasifs.supabase.co/functions/v1/process-payment',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            redemption_id,
            deal_id: deal.id,
            amount,
            phone,
            currency: 'RWF',
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Payment service error')
      }

      // 6. Store the transaction ID and payment status
      setTransactionId(data.transaction_id)
      setPaymentStatus('pending')

      // 7. Redirect to UmunotaPay payment page
      if (data.payment_url) {
        window.location.href = data.payment_url
      } else {
        throw new Error('No payment URL received from provider')
      }
    } catch (err) {
      console.error('Payment error:', err.message)
      setError(err.message || 'Something went wrong. Please try again.')
      setOrdering(false)
    }
  }

  // --- Legacy order handler (kept for fallback – you can remove later) ---
  async function handleLegacyOrder() {
    setOrdering(true)
    setError('')

    const { data: userData } = await supabase.auth.getUser()
    const newCode = makeCode()

    const { data: redemptionData, error: insertError } = await supabase
      .from('redemptions')
      .insert({
        deal_id: deal.id,
        student_id: userData.user.id,
        student_name: userData.user.user_metadata?.full_name ?? userData.user.email,
        code: newCode,
        status: 'pending',
      })
      .select('id')
      .single()

    setOrdering(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    // Navigate to a checkout page (or payment page)
    navigate(`/payment?amount=${finalPrice || deal.price || 0}&deal_id=${deal.id}&redemption_id=${redemptionData.id}`)
  }

  // Determine which function to use – we're using the new one by default
  const handleOrder = handleOrderWithPayment

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md">
      <div className="relative h-40 w-full">
        {deal.image_url ? (
          <img src={deal.image_url} alt={deal.title} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-accent/30 via-muted to-card flex items-center justify-center">
            <ForkKnifeIcon />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" />
        {deal.discount_percent != null && (
          <div className="absolute top-3 right-3 bg-accent text-background-foreground font-display font-semibold text-sm rounded-lg px-3 py-1.5 shadow-lg">
            {deal.discount_percent}% off
          </div>
        )}
      </div>

      <div className="p-4 space-y-1">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">{deal.business_name}</p>
        <h3 className="font-display font-semibold text-lg">{deal.title}</h3>
        {deal.description && <p className="text-muted-foreground text-sm">{deal.description}</p>}
        {ratingStats?.review_count > 0 && (
          <p className="text-amber-500 text-sm">★ {ratingStats.average_rating} <span className="text-muted-foreground">({ratingStats.review_count} reviews)</span></p>
        )}
        <div className="flex items-center gap-2 text-xs pt-1">
          {finalPrice != null && (
            <span className="flex items-center gap-2">
              {hasDiscount && (
                <span className="line-through text-muted-foreground">{deal.price} RWF</span>
              )}
              <span className="text-primary font-bold text-sm">{finalPrice} RWF</span>
            </span>
          )}
          {expiresLabel && <span className="text-muted-foreground">Valid until {expiresLabel}</span>}
        </div>

        {/* --- PAYMENT UI --- */}
        {paymentStatus === 'pending' ? (
          <div className="mt-3 bg-accent/10 border border-accent/40 rounded-lg p-4 text-center">
            <p className="text-muted-foreground text-sm">⏳ Redirecting to payment...</p>
            <div className="mt-2 h-1 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full w-1/2 bg-accent animate-pulse rounded-full" />
            </div>
          </div>
        ) : (
          <button
            onClick={handleOrder}
            disabled={ordering}
            className="mt-3 w-full bg-primary hover:bg-accent-dim text-primary-foreground font-semibold rounded-lg py-2.5 transition disabled:opacity-50"
          >
            {ordering ? 'Processing...' : 'Order now'}
          </button>
        )}

        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      </div>
    </div>
  )
}export default DealsFeed;
