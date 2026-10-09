// Pure helpers for profile pictures (no React, no Supabase), so they can be
// unit-tested on their own.

const MAX_SOURCE_BYTES = 15 * 1024 * 1024 // phone photos; the result is ~50–150 KB

// The biggest centred square of a width × height picture.
export function avatarCropRect(width, height) {
  const size = Math.min(width, height)
  return { sx: Math.round((width - size) / 2), sy: Math.round((height - size) / 2), size }
}

export function avatarFileProblem(file) {
  if (!file) return 'Choose a photo.'
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) return 'Choose a photo (JPG, PNG or WebP).'
  if (file.size > MAX_SOURCE_BYTES) return 'This photo is too big. Choose one under 15 MB.'
  return ''
}
