import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import StudentAvatar from './StudentAvatar.jsx'
import { haptic } from '../lib/haptics.js'
import { removeAvatar, saveAvatar, useStudentAvatar } from '../lib/studentAvatars.js'

// The student's own profile picture with Add / Change / Remove.
// Who sees it: signed-in students (not businesses, not people you blocked).
export default function AvatarEditor({ userId, name, avatarPath, onChange }) {
  const url = useStudentAvatar(userId)
  const inputRef = useRef(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const pick = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy('Saving your photo…')
    setError('')
    try {
      const path = await saveAvatar(file, { userId, oldPath: avatarPath })
      onChange?.(path)
      haptic(15)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setBusy('')
    }
  }

  const remove = async () => {
    setBusy('Removing your photo…')
    setError('')
    try {
      await removeAvatar({ userId, oldPath: avatarPath })
      onChange?.(null)
    } catch (removeError) {
      setError(removeError.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={Boolean(busy)}
        aria-label={avatarPath ? 'Change profile photo' : 'Add profile photo'}
        className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <StudentAvatar src={avatarPath ? url : null} name={name} size="lg" alt="" />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-accent text-background"
        >
          <Camera size={14} strokeWidth={2.5} />
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={pick} className="hidden" data-testid="avatar-input" />
      <div className="flex gap-4 whitespace-nowrap text-xs">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={Boolean(busy)}
          className="min-h-11 px-1 font-medium text-accent underline underline-offset-2"
        >
          {avatarPath ? 'Change photo' : 'Add photo'}
        </button>
        {avatarPath && (
          <button
            type="button"
            onClick={remove}
            disabled={Boolean(busy)}
            className="min-h-11 px-1 font-medium text-muted-foreground underline underline-offset-2"
          >
            Remove photo
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Students on Unipicks can see it. Businesses can't.</p>
      {busy && <p role="status" className="text-xs text-muted-foreground">{busy}</p>}
      {error && <p role="alert" className="max-w-[12rem] text-center text-xs text-red-400">{error}</p>}
    </div>
  )
}
