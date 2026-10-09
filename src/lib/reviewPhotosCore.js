// Pure helpers for review photos (no React, no Supabase), unit-tested.

export const REVIEW_PHOTO_MAX = 1080 // px on the long side, like Instagram

// Same shape, never bigger than max on the long side, never enlarged.
export function fitWithin(width, height, max = REVIEW_PHOTO_MAX) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
