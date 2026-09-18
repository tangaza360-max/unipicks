import { ArrowRight } from 'lucide-react'

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <div
      className={[
        'flex min-h-[220px] flex-col items-center justify-center px-6 py-10 text-center',
        className,
      ].join(' ')}
    >
      {icon && (
        <div
          aria-hidden="true"
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-foreground/[0.08] text-muted-foreground"
        >
          {icon}
        </div>
      )}

      <h2 className="text-base font-semibold text-foreground">
        {title}
      </h2>

      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={[
            'mt-5 inline-flex min-h-11 items-center gap-2 rounded-full',
            'bg-accent px-4 text-sm font-semibold text-accent-foreground',
            'transition-[background-color,transform] duration-150 ease-out',
            'hover:bg-accent/90',
            'active:scale-95',
            'focus-visible:outline-none',
            'focus-visible:ring-2 focus-visible:ring-accent',
            'focus-visible:ring-offset-2',
            'focus-visible:ring-offset-background',
          ].join(' ')}
        >
          {actionLabel}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
