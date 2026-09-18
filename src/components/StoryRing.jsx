import { Plus } from 'lucide-react'
import StudentAvatar from './StudentAvatar.jsx'

export default function StoryRing({
  src,
  name = '',
  label,
  size = 'md',
  hasStory = true,
  viewed = false,
  isOwn = false,
  onClick,
  className = '',
}) {
  const labelText = label ?? (isOwn ? 'Your Story' : name)

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={labelText}
      disabled={!onClick}
      className={[
        'group flex min-w-16 flex-col items-center gap-1.5',
        'rounded-xl p-1',
        'transition-transform duration-150 ease-out',
        onClick ? 'active:scale-95' : 'cursor-default',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        className,
      ].join(' ')}
    >
      <span
        className={[
          'relative flex rounded-full p-[2px]',
          hasStory && !viewed
            ? 'bg-[conic-gradient(from_180deg,hsl(var(--color-primary)),hsl(var(--color-primary))_35%,hsl(var(--color-text-primary))_55%,hsl(var(--color-primary))_80%,hsl(var(--color-primary)))]'
            : 'bg-border',
          size === 'sm'
            ? 'h-12 w-12'
            : size === 'lg'
              ? 'h-20 w-20'
              : 'h-16 w-16',
        ].join(' ')}
      >
        <span className="flex h-full w-full items-center justify-center rounded-full bg-background p-[2px]">
          <StudentAvatar
            src={src}
            name={name}
            size={size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : 'md'}
            className="h-full w-full"
          />
        </span>

        {isOwn && (
          <span
            aria-hidden="true"
            className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-accent text-accent-foreground"
          >
            <Plus size={12} strokeWidth={3} />
          </span>
        )}
      </span>

      <span className="max-w-16 truncate text-[11px] font-medium text-muted-foreground">
        {labelText}
      </span>
    </button>
  )
}
