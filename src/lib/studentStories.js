// Student stories (founder decision 2026-10-05): friends only, photos and
// GIFs, gone after 24 hours. The database enforces all of this
// (migration 20261005100000_student_stories_friends); these helpers only
// prepare the photo and give plain-English errors.
import { supabase } from './supabaseClient.js'

export const STORY_BUCKET = 'student-stories'
export const STORY_MAX_BYTES = 5 * 1024 * 1024
export const STORY_CAPTION_MAX = 200
export const STORY_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// Event any screen can send to open the camera (StudentLayout listens).
export const OPEN_CAMERA_EVENT = 'unipicks-open-camera'
export function openStoryCamera() {
  window.dispatchEvent(new CustomEvent(OPEN_CAMERA_EVENT))
}

// Sent after a story is posted, so the Social screen can refresh.
export const STORY_POSTED_EVENT = 'unipicks-story-posted'

// Plain-English problem with a chosen file, or '' when it can be posted.
export function storyFileProblem(file) {
  if (!file) return 'Choose a photo or GIF.'
  if (!STORY_TYPES[file.type]) return 'Choose a photo (JPG, PNG, WebP) or a GIF.'
  if (file.size > STORY_MAX_BYTES) return 'This file is too big. Choose one under 5 MB.'
  return ''
}

// Upload the photo to the poster's own folder, then save the story.
// Returns the new story row. Removes the photo again if saving fails.
export async function postStory({ file, caption = '' }) {
  const problem = storyFileProblem(file)
  if (problem) throw new Error(problem)

  const trimmed = caption.trim()
  if (trimmed.length > STORY_CAPTION_MAX) {
    throw new Error(`Keep the caption under ${STORY_CAPTION_MAX} characters.`)
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Please log in again.')

  const path = `${user.id}/${crypto.randomUUID()}.${STORY_TYPES[file.type]}`

  const { error: uploadError } = await supabase.storage
    .from(STORY_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    console.error('Story upload failed:', uploadError)
    throw new Error("We couldn't upload your photo. Check your connection and try again.")
  }

  // created_at and expires_at are set by the database (24 hours).
  const { data, error } = await supabase
    .from('student_stories')
    .insert({ student_id: user.id, media_url: path, caption: trimmed || null })
    .select('id, created_at, expires_at')
    .single()

  if (error) {
    console.error('Story save failed:', error)
    await supabase.storage.from(STORY_BUCKET).remove([path])
    throw new Error(
      error.message?.includes('suspended')
        ? 'Your account is suspended. Contact support.'
        : "We couldn't post your story. Please try again."
    )
  }

  return data
}

// Make a camera photo smaller before upload (saves mobile data):
// longest side at most 1440 px, JPEG.
export function canvasToStoryFile(canvas, maxSide = 1440) {
  return new Promise((resolve) => {
    let source = canvas
    const longest = Math.max(canvas.width, canvas.height)
    if (longest > maxSide) {
      const scale = maxSide / longest
      source = document.createElement('canvas')
      source.width = Math.round(canvas.width * scale)
      source.height = Math.round(canvas.height * scale)
      source.getContext('2d').drawImage(canvas, 0, 0, source.width, source.height)
    }
    source.toBlob(
      (blob) => resolve(blob ? new File([blob], `unipicks-${Date.now()}.jpg`, { type: 'image/jpeg' }) : null),
      'image/jpeg',
      0.85
    )
  })
}
