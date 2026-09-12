export default function Logo({ size = 28, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 130 130"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M32,28 L32,86 A34,34 0 0 0 100,86 L100,40"
        stroke="currentColor"
        strokeWidth="16"
        strokeLinecap="round"
      />
      <circle cx="108" cy="16" r="10" fill="currentColor" />
    </svg>
  )
}
