import { forwardRef } from 'react'
import { haptic } from '../lib/haptics.js'

const IconButton = forwardRef(function IconButton(
  {
    children,
    ariaLabel,
    onClick,
    type = 'button',
    disabled = false,
    active = false,
    className = '',
    hapticPattern = 10,
    title,
    ...props
  },
  ref,
) {
  function handleClick(event) {
    if (disabled) return

    haptic(hapticPattern)
    onClick?.(event)
  }

  return (
    <button
      ref={ref}
      type={type}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      onClick={handleClick}
      aria-pressed={active ? true : undefined}
      className={[
        'inline-flex min-h-11 min-w-11 items-center justify-center',
        'rounded-full',
        'transition-[background-color,color,transform,opacity]',
        'duration-150 ease-out',
        'hover:bg-foreground/10',
        'active:scale-95 active:bg-foreground/[0.15]',
        'focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-accent',
        'focus-visible:ring-offset-2',
        'focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        active ? 'bg-foreground/10 text-accent' : 'text-foreground',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
})

export default IconButton
