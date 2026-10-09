import { supabase } from './supabaseClient.js'
import { avatarFileProblem } from './studentAvatarsCore.js'
import { REVIEW_PHOTO_MAX, fitWithin } from './reviewPhotosCore.js'

// Reviews with a food photo. The photo lives in the private 'review-photos'
// bucket as '<student id>/<random id>.jpg' (database rule), read through
// 1-hour links by signed-in people only.
export const REVIEW_BUCKET = 'review-photos'
const MAX_BYTES = 1024 * 1024 // bucket limit

export const reviewPhotoProblem = avatarFileProblem

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({ img, url })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("We couldn't read this photo. Try another one."))
    }
    img.src = url
  })
}

// At most 1080 px, JPEG under 1 MB. Re-drawing also drops hidden photo data
// (camera, time, GPS location).
export async function reviewPhotoFile(file) {
  const { img, url } = await loadImage(file)
  try {
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, REVIEW_PHOTO_MAX)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(img, 0, 0, width, height)
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (blob && blob.size <= MAX_BYTES) return new File([blob], 'review.jpg', { type: 'image/jpeg' })
    }
    throw new Error('This photo is too detailed to send. Try another one.')
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Upload the photo (if any), then save the rating. If saving fails, the
// uploaded photo is removed again.
export async function submitReview({ redemption, rating, review, file }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Please log in again.')

  let photoPath = null
  if (file) {
    const problem = reviewPhotoProblem(file)
    if (problem) throw new Error(problem)
    const small = await reviewPhotoFile(file)
    photoPath = `${user.id}/${crypto.randomUUID()}.jpg`
    const { error: uploadError } = await supabase.storage
      .from(REVIEW_BUCKET)
      .upload(photoPath, small, { contentType: 'image/jpeg', upsert: false })
    if (uploadError) throw new Error("We couldn't upload your photo. Check your connection and try again.")
  }

  const { error } = await supabase.from('ratings').insert({
    deal_id: redemption.deal_id,
    merchant_id: redemption.deals?.merchant_id || null,
    student_id: user.id,
    redemption_id: redemption.id,
    rating,
    review: review.trim() || null,
    photo_path: photoPath,
  })
  if (error) {
    if (photoPath) await supabase.storage.from(REVIEW_BUCKET).remove([photoPath])
    throw new Error(error.code === '23505' ? 'You already rated this order.' : "Your review wasn't saved. Please try again.")
  }
}

// 1-hour links for many review photos at once.
export async function reviewPhotoUrls(paths) {
  const unique = [...new Set(paths.filter(Boolean))]
  if (unique.length === 0) return {}
  const { data, error } = await supabase.storage.from(REVIEW_BUCKET).createSignedUrls(unique, 3600)
  if (error) {
    console.warn('Could not open review photos:', error.message)
    return {}
  }
  return Object.fromEntries((data || []).filter((l) => l.signedUrl).map((l) => [l.path, l.signedUrl]))
}
