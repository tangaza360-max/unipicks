// Which discovery rows Home shows ("Available now", "Under 3,000 RWF", …).
// A row is left out when it has fewer than MIN_ROW deals (one card only
// repeats "All deals"), when it holds every deal (it would repeat the full
// list), or when an earlier row already shows exactly the same deals.
export const MIN_ROW = 2

export function discoveryRows(candidates, totalDeals) {
  const shown = new Set()
  return candidates.filter(([, list]) => {
    if (list.length < MIN_ROW || list.length >= totalDeals) return false
    const key = list.map((d) => d.id).sort().join(',')
    if (shown.has(key)) return false
    shown.add(key)
    return true
  })
}
