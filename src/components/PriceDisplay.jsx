export default function PriceDisplay({
  price,
  originalPrice,
  discount,
  variant = 'compact',
  currency = 'RWF',
  badge = 'Student price',
  className = '',
}) {
  const formattedPrice = formatPrice(price)
  const formattedOriginalPrice =
    originalPrice !== undefined && originalPrice !== null
      ? formatPrice(originalPrice)
      : null

  const discountLabel =
    discount !== undefined && discount !== null
      ? formatDiscount(discount)
      : null

  if (variant === 'full') {
    return (
      <div
        className={[
          'flex flex-wrap items-end gap-x-2 gap-y-1',
          className,
        ].join(' ')}
      >
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {formattedPrice}
          </span>

          <span className="text-xs font-medium text-muted-foreground">
            {currency}
          </span>
        </div>

        {formattedOriginalPrice && (
          <span className="pb-0.5 text-sm text-muted-foreground line-through">
            {formattedOriginalPrice} {currency}
          </span>
        )}

        {discountLabel && (
          <span className="rounded-full bg-accent/[0.15] px-2 py-1 text-xs font-semibold text-accent">
            {discountLabel}
          </span>
        )}

        {badge && (
          <span className="rounded-full bg-foreground/[0.08] px-2 py-1 text-xs font-medium text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={['flex items-center gap-2', className].join(' ')}>
      <span className="text-lg font-bold tracking-tight text-foreground">
        {formattedPrice}
        <span className="ml-1 text-xs font-medium text-muted-foreground">
          {currency}
        </span>
      </span>

      {discountLabel && (
        <span className="rounded-full bg-accent/[0.15] px-2 py-1 text-xs font-semibold text-accent">
          {discountLabel}
        </span>
      )}
    </div>
  )
}

function formatPrice(value) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return '—'
  }

  return new Intl.NumberFormat('en-RW', {
    maximumFractionDigits: 0,
  }).format(numericValue)
}

function formatDiscount(value) {
  if (typeof value === 'string') {
    return value.includes('%') ? value : `${value}% off`
  }

  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return ''
  }

  return `${Math.round(numericValue)}% off`
}
