// The 3 button types (style guide §4), all at least 44 px tall:
//   main      – green with ink text: the one next step on a screen
//   secondary – outline: other actions
//   danger    – red outline and text: Delete, Decline
// Pass `href` to render a link that looks like a button (e.g. tel: links).
const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition ' +
  'disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

const VARIANTS = {
  main: 'bg-accent text-background-foreground hover:bg-accent-dim',
  secondary: 'border border-border bg-transparent text-foreground hover:bg-muted',
  danger: 'border border-[color:var(--status-bad-fg)] bg-transparent text-[color:var(--status-bad-fg)] hover:bg-[color:var(--status-bad-bg)]',
}

export default function Button({ variant = 'main', href, className = '', type = 'button', children, ...rest }) {
  const classes = `${BASE} ${VARIANTS[variant] || VARIANTS.main} ${className}`
  if (href) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    )
  }
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  )
}
