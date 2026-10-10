import { useEffect, useState } from 'react'

// "4:12" until a deadline, ticking every second; null without a deadline.
export function useCountdown(deadline) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!deadline) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [deadline])
  if (!deadline) return null
  const ms = new Date(deadline).getTime() - now
  if (ms <= 0) return { expired: true, label: '0:00' }
  const total = Math.ceil(ms / 1000)
  return { expired: false, label: `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}` }
}
