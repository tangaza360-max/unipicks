import { useEffect, useRef, useState } from 'react'
import { CameraOff, ImageUp, RefreshCw, X } from 'lucide-react'
import { haptic } from '../lib/haptics.js'
import Button from './Button.jsx'
import {
  STORY_CAPTION_MAX,
  STORY_POSTED_EVENT,
  STORY_TYPES,
  canvasToStoryFile,
  postStory,
  storyFileProblem,
} from '../lib/studentStories.js'

// Camera: take a photo (or choose a photo or GIF from the phone), then post
// it to your story (friends see it for 24 hours), save it, or share it to
// another app.
export default function StudentCamera({ onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const lastTapRef = useRef(0)
  const fileInputRef = useRef(null)
  const [facingMode, setFacingMode] = useState('user')
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [caption, setCaption] = useState('')
  const [error, setError] = useState('')
  const [posting, setPosting] = useState(false)
  const [posted, setPosted] = useState(false)

  useEffect(() => {
    let cancelled = false

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }

        setPermissionDenied(false)
      } catch (error) {
        if (!cancelled) {
          console.error('Camera access failed:', error)
          setPermissionDenied(true)
        }
      }
    }

    startCamera()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [facingMode])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleToggleCamera = () => {
    setFacingMode((current) => (current === 'user' ? 'environment' : 'user'))
  }

  const handleVideoTap = () => {
    if (previewUrl) return

    const now = Date.now()
    if (now - lastTapRef.current <= 300) {
      lastTapRef.current = 0
      handleToggleCamera()
      return
    }

    lastTapRef.current = now
  }

  const showFile = (nextFile) => {
    setFile(nextFile)
    setPreviewUrl(URL.createObjectURL(nextFile))
    setError('')
  }

  const handleShutter = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) return

    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0, width, height)

    const photo = await canvasToStoryFile(canvas)
    if (!photo) return
    showFile(photo)
    haptic(20)
  }

  const handleChooseFile = (event) => {
    const chosen = event.target.files?.[0]
    event.target.value = ''
    if (!chosen) return

    const problem = storyFileProblem(chosen)
    if (problem) {
      setError(problem)
      return
    }
    showFile(chosen)
  }

  const handleSave = () => {
    if (!previewUrl || !file) return

    const a = document.createElement('a')
    a.href = previewUrl
    a.download = `unipicks-${Date.now()}.${STORY_TYPES[file.type] || 'jpg'}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    haptic(10)
  }

  const handleShare = async () => {
    if (!file) return

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
      } catch (shareError) {
        if (shareError.name !== 'AbortError') {
          console.error(shareError)
        }
      }
    } else {
      handleSave()
    }
  }

  const handleRetake = () => {
    setFile(null)
    setPreviewUrl(null)
    setCaption('')
    setError('')
    haptic(10)
  }

  const handlePost = async () => {
    if (!file || posting) return
    setPosting(true)
    setError('')

    try {
      await postStory({ file, caption })
      haptic(20)
      setPosted(true)
      window.dispatchEvent(new CustomEvent(STORY_POSTED_EVENT))
      setTimeout(onClose, 1500)
    } catch (postError) {
      setError(postError.message)
    } finally {
      setPosting(false)
    }
  }

  const chooseButton = (
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      aria-label="Choose a photo or GIF from your phone"
      className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md"
    >
      <ImageUp size={22} />
    </button>
  )

  return (
    <div className="fixed inset-0 z-[100] flex min-h-[100dvh] flex-col bg-background text-foreground">
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4"
        style={{ paddingTop: 'calc(var(--safe-area-top) + 12px)' }}
      >
        <button
          type="button"
          onClick={previewUrl && !posted ? handleRetake : onClose}
          aria-label={previewUrl && !posted ? 'Retake' : 'Close camera'}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md"
        >
          <X size={24} />
        </button>

        {!previewUrl && !permissionDenied && (
          <button
            type="button"
            onClick={handleToggleCamera}
            aria-label="Switch camera"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md"
          >
            <RefreshCw size={22} />
          </button>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept={Object.keys(STORY_TYPES).join(',')}
        onChange={handleChooseFile}
        className="hidden"
        data-testid="story-file-input"
      />

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Your photo"
            className="h-full w-full object-contain"
          />
        ) : permissionDenied ? (
          <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center text-white">
            <CameraOff size={48} />
            <p className="text-base">
              Camera access is needed to take photos. Turn it on in your browser settings, or choose a photo from your phone.
            </p>
            <Button onClick={() => fileInputRef.current?.click()}>
              <ImageUp size={18} />
              Choose from phone
            </Button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onClick={handleVideoTap}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pt-10"
        style={{ paddingBottom: 'calc(var(--safe-area-bottom) + 16px)' }}
      >
        {error && (
          <p role="alert" className="mb-3 w-full max-w-md rounded-lg bg-black/70 px-3 py-2 text-center text-sm text-white">
            {error}
          </p>
        )}

        {posted ? (
          <p role="status" className="mb-4 w-full max-w-md rounded-lg bg-black/70 px-3 py-3 text-center text-sm font-medium text-white">
            Posted. Your friends can see it for 24 hours.
          </p>
        ) : previewUrl ? (
          <div className="flex w-full max-w-md flex-col gap-3">
            <label className="sr-only" htmlFor="story-caption">Caption</label>
            <input
              id="story-caption"
              type="text"
              value={caption}
              maxLength={STORY_CAPTION_MAX}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Add a caption · optional"
              className="min-h-11 w-full rounded-lg border border-white/30 bg-black/40 px-3 text-base text-white placeholder:text-white/70 outline-none focus:border-white"
            />
            <p className="text-center text-xs text-white/90">
              Only your friends see your story. It disappears after 24 hours.
            </p>
            <Button onClick={handlePost} disabled={posting} className="w-full">
              {posting ? 'Posting…' : 'Post to your story'}
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleSave}
                className="min-h-11 rounded-lg border border-white/50 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="min-h-11 rounded-lg border border-white/50 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Share
              </button>
            </div>
          </div>
        ) : (
          <div className="flex w-full max-w-md items-center justify-between">
            {permissionDenied ? <span className="h-12 w-12" /> : chooseButton}

            {!permissionDenied && (
              <button
                type="button"
                onClick={handleShutter}
                aria-label="Take photo"
                className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 p-1"
              >
                <span className="h-full w-full rounded-full bg-white" />
              </button>
            )}

            <span className="h-12 w-12" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  )
}
