import { useEffect, useRef, useState } from 'react'
import { CameraOff, ImageUp, RefreshCw, Sparkles, Timer, X, Zap, ZapOff } from 'lucide-react'
import { haptic } from '../lib/haptics.js'
import Button from './Button.jsx'
import {
  STORY_CAPTION_MAX,
  STORY_POSTED_EVENT,
  STORY_MAX_BYTES,
  STORY_TYPES,
  canvasToStoryFile,
  postStory,
  storyFileProblem,
} from '../lib/studentStories.js'
import { clampZoom, drawCrop, nextTimer, pinchZoom, visibleCrop } from '../lib/cameraFrame.js'
import { FILTERS, applyFilter, nextFilterIndex, svgMatrixValues } from '../lib/cameraFilters.js'
import { BOOMERANG_SECONDS, GIF_FPS, GIF_MAX_SECONDS, gifSize, makeGif } from '../lib/gifMaker.js'

// Camera: take a photo (or choose a photo or GIF from the phone), then post
// it to your story (friends see it for 24 hours), save it, or share it to
// another app. The photo is exactly what the screen showed (same crop and
// zoom; selfies mirrored). Flash: the phone light on the back camera when the
// phone allows it, otherwise a white screen. Timer: 3 or 10 seconds. Zoom:
// pinch, or tap the 1× / 2× button. GIF: hold the shutter in Photo mode, or
// choose GIF / Boomerang and tap (up to 3 s, silent, loops; no video).
// Filters: swipe sideways on the picture, or tap the Filter button.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const HOLD_MS = 300
const MODES = [
  { id: 'photo', label: 'Photo' },
  { id: 'gif', label: 'GIF' },
  { id: 'boomerang', label: 'Boomerang' },
]

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
  const [zoom, setZoom] = useState(1)
  const [flashOn, setFlashOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [screenFlash, setScreenFlash] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [countdown, setCountdown] = useState(0)
  const [capturing, setCapturing] = useState(false)
  const pointersRef = useRef(new Map())
  const pinchRef = useRef(null)
  const countdownRef = useRef(null)
  const mirror = facingMode === 'user'

  const changeFilter = (step) => {
    setFilterIndex((index) => nextFilterIndex(index, step))
    setFilterLabelShown(true)
    clearTimeout(filterLabelTimer.current)
    filterLabelTimer.current = setTimeout(() => setFilterLabelShown(false), 1200)
    haptic(5)
  }
  const [mode, setMode] = useState('photo')
  const [filterIndex, setFilterIndex] = useState(0)
  const filter = FILTERS[filterIndex]
  const [filterLabelShown, setFilterLabelShown] = useState(false)
  const swipeRef = useRef(null)
  const filterLabelTimer = useRef(null)
  const [recording, setRecording] = useState(null) // 'gif' | 'boomerang'
  const [recordProgress, setRecordProgress] = useState(0)
  const [makingGif, setMakingGif] = useState(false)
  const recordRef = useRef(null) // { timer, frames, ctx, crop, size, kind, max }
  const holdRef = useRef({ timer: null, started: false })

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

        const track = stream.getVideoTracks()[0]
        const capabilities = track?.getCapabilities?.() || {}
        setTorchSupported(Boolean(capabilities.torch))
        setZoom(1)
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

  useEffect(
    () => () => {
      clearInterval(countdownRef.current)
      clearInterval(recordRef.current?.timer)
      clearTimeout(holdRef.current.timer)
      clearTimeout(filterLabelTimer.current)
    },
    []
  )

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

  // Exactly what the screen shows: same crop, zoom and mirror.
  const takePhoto = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const box = video.parentElement.getBoundingClientRect()
    const crop = visibleCrop(video.videoWidth, video.videoHeight, box.width, box.height, zoom)
    if (!crop) {
      setError('The camera is starting. Try again.')
      return
    }

    canvas.width = Math.round(crop.sw)
    canvas.height = Math.round(crop.sh)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawCrop(ctx, video, crop, { mirror })
    if (filter.matrix) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
      applyFilter(pixels.data, filter.matrix)
      ctx.putImageData(pixels, 0, 0)
    }

    const photo = await canvasToStoryFile(canvas)
    if (!photo) return
    showFile(photo)
    haptic(20)
  }

  const setTorch = async (on) => {
    const track = streamRef.current?.getVideoTracks()[0]
    try {
      await track?.applyConstraints({ advanced: [{ torch: on }] })
      return true
    } catch {
      return false
    }
  }

  const fire = async () => {
    setCapturing(true)
    try {
      if (flashOn && !mirror && torchSupported && (await setTorch(true))) {
        await sleep(350)
        await takePhoto()
        await setTorch(false)
      } else if (flashOn) {
        // Front camera, or no phone light: light the face with a white screen.
        setScreenFlash(true)
        await sleep(250)
        await takePhoto()
        setScreenFlash(false)
      } else {
        await takePhoto()
      }
    } finally {
      setCapturing(false)
    }
  }

  // GIF: grab small frames 10 times a second (same crop, zoom and mirror as
  // the screen), then turn them into a looping GIF.
  const startRecording = async (kind) => {
    const video = videoRef.current
    if (!video || recordRef.current) return
    const box = video.parentElement.getBoundingClientRect()
    const crop = visibleCrop(video.videoWidth, video.videoHeight, box.width, box.height, zoom)
    if (!crop) {
      setError('The camera is starting. Try again.')
      return
    }

    const size = gifSize(crop.sw, crop.sh)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const max = GIF_FPS * (kind === 'boomerang' ? BOOMERANG_SECONDS : GIF_MAX_SECONDS)
    const record = { frames: [], ctx, crop, size, kind, max, timer: null }
    recordRef.current = record
    setRecording(kind)
    setRecordProgress(0)
    setError('')
    if (flashOn && !mirror && torchSupported) await setTorch(true)
    haptic(15)

    const grab = () => {
      drawCrop(ctx, video, crop, { mirror, ...size })
      record.frames.push(applyFilter(ctx.getImageData(0, 0, size.width, size.height).data, filter.matrix))
      setRecordProgress(record.frames.length / max)
      if (record.frames.length >= max) stopRecording()
    }
    grab()
    record.timer = setInterval(grab, 1000 / GIF_FPS)
  }

  const stopRecording = async () => {
    const record = recordRef.current
    if (!record) return
    recordRef.current = null
    clearInterval(record.timer)
    setRecording(null)
    if (flashOn && !mirror && torchSupported) setTorch(false)

    if (record.frames.length < 5) {
      setError('Hold the button a little longer to make a GIF.')
      return
    }
    setMakingGif(true)
    try {
      const { bytes } = await makeGif(record.frames, record.size.width, record.size.height, {
        boomerang: record.kind === 'boomerang',
        maxBytes: STORY_MAX_BYTES,
      })
      showFile(new File([bytes], `unipicks-${Date.now()}.gif`, { type: 'image/gif' }))
      haptic(20)
    } catch (gifError) {
      setError(gifError.message)
    } finally {
      setMakingGif(false)
    }
  }

  // Photo mode: a quick tap takes a photo; holding records a GIF.
  const handleShutterDown = () => {
    if (mode !== 'photo' || countdown > 0 || capturing) return
    holdRef.current.started = false
    holdRef.current.timer = setTimeout(() => {
      holdRef.current.started = true
      startRecording('gif')
    }, HOLD_MS)
  }
  const handleShutterUp = () => {
    clearTimeout(holdRef.current.timer)
    if (holdRef.current.started && recordRef.current) stopRecording()
  }

  const handleShutterClick = () => {
    if (holdRef.current.started) {
      holdRef.current.started = false
      return
    }
    if (mode !== 'photo' && recordRef.current) {
      stopRecording()
      return
    }
    handleShutter()
  }

  const begin = () => (mode === 'photo' ? fire() : startRecording(mode))

  const handleShutter = () => {
    if (capturing || makingGif) return
    if (countdown > 0) {
      clearInterval(countdownRef.current)
      setCountdown(0)
      return
    }
    if (!timerSeconds) {
      begin()
      return
    }
    let left = timerSeconds
    setCountdown(left)
    countdownRef.current = setInterval(() => {
      left -= 1
      if (left <= 0) {
        clearInterval(countdownRef.current)
        setCountdown(0)
        begin()
      } else {
        setCountdown(left)
        haptic(5)
      }
    }, 1000)
  }

  // Pinch to zoom (two fingers on the camera picture).
  const distanceBetween = () => {
    const [a, b] = [...pointersRef.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
  const handlePointerDown = (event) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointersRef.current.size === 1) {
      swipeRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: Date.now() }
    }
    if (pointersRef.current.size === 2) {
      swipeRef.current = null // two fingers = pinch, not a swipe
      pinchRef.current = { zoom, distance: distanceBetween() }
    }
  }
  const handlePointerMove = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointersRef.current.size === 2 && pinchRef.current) {
      setZoom(pinchZoom(pinchRef.current.zoom, pinchRef.current.distance, distanceBetween()))
    }
  }
  const handlePointerEnd = (event) => {
    // One-finger swipe sideways changes the filter (left = next).
    const swipe = swipeRef.current
    if (swipe && swipe.id === event.pointerId && event.type === 'pointerup') {
      const dx = event.clientX - swipe.x
      const dy = event.clientY - swipe.y
      if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy) && Date.now() - swipe.at < 800) {
        changeFilter(dx < 0 ? 1 : -1)
      }
    }
    if (swipe?.id === event.pointerId) swipeRef.current = null
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
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
        className="absolute inset-x-0 top-0 z-10 flex items-start justify-between px-4"
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
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleToggleCamera}
              aria-label="Switch camera"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md"
            >
              <RefreshCw size={22} />
            </button>
            <button
              type="button"
              onClick={() => setFlashOn((on) => !on)}
              aria-label={flashOn ? 'Flash: on' : 'Flash: off'}
              aria-pressed={flashOn}
              className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md ${
                flashOn ? 'bg-white text-black' : 'bg-black/40 text-white'
              }`}
            >
              {flashOn ? <Zap size={22} /> : <ZapOff size={22} />}
            </button>
            <button
              type="button"
              onClick={() => setTimerSeconds(nextTimer)}
              aria-label={timerSeconds ? `Timer: ${timerSeconds} seconds` : 'Timer: off'}
              className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md ${
                timerSeconds ? 'bg-white text-black' : 'bg-black/40 text-white'
              }`}
            >
              {timerSeconds ? <span className="text-sm font-bold">{timerSeconds}s</span> : <Timer size={22} />}
            </button>
            <button
              type="button"
              onClick={() => changeFilter(1)}
              aria-label={`Filter: ${filter.label}. Tap for the next filter`}
              className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md ${
                filter.matrix ? 'bg-white text-black' : 'bg-black/40 text-white'
              }`}
            >
              <Sparkles size={22} />
            </button>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
      {/* The live preview uses the same colour matrix as the saved photo. */}
      <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
        <filter id="unipicks-camera-filter" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={svgMatrixValues(filter.matrix)} />
        </filter>
      </svg>

      {filterLabelShown && !previewUrl && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 z-20 flex justify-center" aria-live="polite">
          <span className="rounded-full bg-black/60 px-4 py-2 text-base font-semibold text-white" data-testid="filter-name">
            {filter.label}
          </span>
        </div>
      )}

      {screenFlash && <div className="fixed inset-0 z-[120] bg-white" aria-hidden="true" />}

      {countdown > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          aria-live="assertive"
        >
          <span className="text-8xl font-bold text-white drop-shadow-lg" data-testid="countdown">
            {countdown}
          </span>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={Object.keys(STORY_TYPES).join(',')}
        onChange={handleChooseFile}
        className="hidden"
        data-testid="story-file-input"
      />

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        {/* The camera stays on under the photo preview, so Retake is instant. */}
        {permissionDenied ? (
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
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            style={{
              transform: `scale(${mirror ? -zoom : zoom}, ${zoom})`,
              touchAction: 'none',
              filter: filter.matrix ? 'url(#unipicks-camera-filter)' : 'none',
            }}
            className="h-full w-full object-cover"
            data-testid="camera-video"
          />
        )}
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Your photo"
            className="absolute inset-0 h-full w-full bg-black object-contain"
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
          <div className="flex w-full max-w-md flex-col items-center gap-4">
            {!permissionDenied && (
              <button
                type="button"
                onClick={() => setZoom((current) => (current > 1 ? 1 : 2))}
                aria-label={`Zoom ${zoom.toFixed(1)} times. Tap to ${zoom > 1 ? 'zoom out' : 'zoom in'}`}
                className="flex h-11 min-w-11 items-center justify-center rounded-full bg-black/50 px-3 text-sm font-semibold text-white backdrop-blur-md"
              >
                {zoom > 1 ? `${clampZoom(zoom).toFixed(1)}×` : '1×'}
              </button>
            )}
            {!permissionDenied && !recording && (
              <div role="radiogroup" aria-label="Camera mode" className="flex items-center gap-1">
                {MODES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={mode === item.id}
                    onClick={() => setMode(item.id)}
                    className={`min-h-11 rounded-full px-4 text-sm font-semibold transition ${
                      mode === item.id ? 'bg-white text-black' : 'text-white/90 hover:bg-white/10'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            {!permissionDenied && (
              <p className="text-xs text-white/90" aria-live="polite">
                {makingGif
                  ? 'Making your GIF…'
                  : recording
                    ? 'Recording…'
                    : mode === 'photo'
                      ? 'Tap for a photo, hold for a GIF'
                      : mode === 'gif'
                        ? 'Tap to record up to 3 seconds'
                        : 'Tap to record a Boomerang'}
              </p>
            )}
          <div className="flex w-full items-center justify-between">
            {permissionDenied ? <span className="h-12 w-12" /> : chooseButton}

            {!permissionDenied && (
              <button
                type="button"
                onClick={handleShutterClick}
                onPointerDown={handleShutterDown}
                onPointerUp={handleShutterUp}
                onPointerLeave={handleShutterUp}
                onContextMenu={(event) => event.preventDefault()}
                disabled={makingGif}
                aria-label={
                  countdown > 0
                    ? 'Cancel timer'
                    : recording
                      ? 'Stop recording'
                      : mode === 'gif'
                        ? 'Record GIF'
                        : mode === 'boomerang'
                          ? 'Record Boomerang'
                          : 'Take photo'
                }
                className="flex h-20 w-20 select-none items-center justify-center rounded-full p-1"
                style={{
                  touchAction: 'none',
                  background: recording
                    ? `conic-gradient(#ef4444 ${recordProgress * 360}deg, rgba(255,255,255,0.35) 0deg)`
                    : 'white',
                }}
                data-testid="shutter"
              >
                <span
                  className={`h-full w-full rounded-full border-4 border-black/10 ${
                    recording || mode !== 'photo' ? 'bg-red-500' : 'bg-white'
                  } ${recording ? 'scale-75' : ''} transition-transform`}
                />
              </button>
            )}

            <span className="h-12 w-12" aria-hidden="true" />
          </div>
          </div>
        )}
      </div>
    </div>
  )
}
