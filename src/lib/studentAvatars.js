import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { avatarCropRect, avatarFileProblem } from './studentAvatarsCore.js'

export { avatarCropRect, avatarFileProblem }

// Student profile pictures (founder decision 2026-10-09: all signed-in
// students see them; businesses and visitors don't). The file lives in the
// private 'student-avatars' bucket as '<user id>/<random id>.jpg' and is read
// through signed links that last one hour.

export const AVATAR_BUCKET = 'student-avatars'
export const AVATAR_SIZE = 512 // px, square
export const AVATAR_CHANGED_EVENT = 'unipicks:avatar-changed'
const LINK_SECONDS = 60 * 60

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

// Square, 512 px, JPEG. Re-drawing the picture also drops hidden photo data
// (camera, time, GPS location) that phones store inside the file.
export async function squareAvatarFile(file) {
  const { img, url } = await loadImage(file)
  try {
    const { sx, sy, size } = avatarCropRect(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE
    canvas.getContext('2d').drawImage(img, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) throw new Error("We couldn't prepare this photo. Try another one.")
    return new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Upload the new picture, point the profile to it, then remove the old file.
export async function saveAvatar(file, { userId, oldPath }) {
  const problem = avatarFileProblem(file)
  if (problem) throw new Error(problem)
  const square = await squareAvatarFile(file)
  const path = `${userId}/${crypto.randomUUID()}.jpg`

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, square, { contentType: 'image/jpeg', upsert: false })
  if (uploadError) throw new Error("We couldn't upload your photo. Check your connection and try again.")

  const { error: saveError } = await supabase.from('student_profiles').update({ avatar_path: path }).eq('user_id', userId)
  if (saveError) {
    await supabase.storage.from(AVATAR_BUCKET).remove([path])
    throw new Error("We couldn't save your photo. Please try again.")
  }
  if (oldPath && oldPath !== path) await supabase.storage.from(AVATAR_BUCKET).remove([oldPath])
  forgetAvatar(userId)
  window.dispatchEvent(new CustomEvent(AVATAR_CHANGED_EVENT, { detail: { userId } }))
  return path
}

export async function removeAvatar({ userId, oldPath }) {
  const { error } = await supabase.from('student_profiles').update({ avatar_path: null }).eq('user_id', userId)
  if (error) throw new Error("We couldn't remove your photo. Please try again.")
  if (oldPath) await supabase.storage.from(AVATAR_BUCKET).remove([oldPath])
  forgetAvatar(userId)
  window.dispatchEvent(new CustomEvent(AVATAR_CHANGED_EVENT, { detail: { userId } }))
}

// --- Showing pictures: many students in one request, remembered for a while.
const cache = new Map() // userId -> { url: string | null, until: ms }
let pending = null // { ids: Set, promise }

function forgetAvatar(userId) {
  cache.delete(userId)
}

async function fetchAvatars(ids) {
  const { data, error } = await supabase.rpc('get_student_avatars', { p_user_ids: ids })
  const found = error ? [] : data || []
  const urls = new Map()
  if (found.length) {
    const { data: links } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrls(found.map((row) => row.avatar_path), LINK_SECONDS)
    found.forEach((row, index) => urls.set(row.user_id, links?.[index]?.signedUrl || null))
  }
  // Remember "no picture" too, so lists don't ask again on every render.
  const until = Date.now() + (LINK_SECONDS - 300) * 1000
  for (const id of ids) cache.set(id, { url: urls.get(id) || null, until })
}

export function avatarUrlFor(userId) {
  if (!userId) return Promise.resolve(null)
  const hit = cache.get(userId)
  if (hit && hit.until > Date.now()) return Promise.resolve(hit.url)
  // Collect the ids asked for in the same moment and fetch them together.
  if (!pending) {
    const ids = new Set()
    const promise = Promise.resolve().then(async () => {
      pending = null
      await fetchAvatars([...ids])
    })
    pending = { ids, promise }
  }
  pending.ids.add(userId)
  const { promise } = pending
  return promise.then(() => cache.get(userId)?.url || null)
}

export function useStudentAvatar(userId) {
  const [url, setUrl] = useState(() => {
    const hit = userId && cache.get(userId)
    return hit && hit.until > Date.now() ? hit.url : null
  })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const onChange = (event) => {
      if (event.detail?.userId === userId) setVersion((v) => v + 1)
    }
    window.addEventListener(AVATAR_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(AVATAR_CHANGED_EVENT, onChange)
  }, [userId])

  useEffect(() => {
    let active = true
    avatarUrlFor(userId).then((next) => {
      if (active) setUrl(next)
    })
    return () => {
      active = false
    }
  }, [userId, version])

  return url
}
