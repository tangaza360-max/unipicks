export default function Skeleton({
  variant = 'line',
  className = '',
}) {
  const variants = {
    line: 'h-4 w-full rounded-md',
    text: 'h-3 w-3/4 rounded-md',
    circle: 'h-12 w-12 rounded-full',
    avatar: 'h-12 w-12 rounded-full',
    card: 'h-32 w-full rounded-2xl',
    image: 'aspect-[4/3] w-full rounded-2xl',
    button: 'h-11 w-28 rounded-full',
  }

  return (
    <span
      aria-hidden="true"
      className={[
        'block animate-pulse bg-foreground/[0.08]',
        variants[variant] ?? variants.line,
        className,
      ].join(' ')}
    />
  )
}

export function SkeletonGroup({
  count = 3,
  variant = 'line',
  className = '',
}) {
  return (
    <div
      aria-hidden="true"
      className={['space-y-3', className].join(' ')}
    >
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton
          key={index}
          variant={variant}
        />
      ))}
    </div>
  )
}
