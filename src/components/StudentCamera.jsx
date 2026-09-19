import { useEffect, useRef, useState } from 'react'
import { CameraOff, RefreshCw, X } from 'lucide-react'
import { haptic } from '../lib/haptics.js'

export default function StudentCamera({ onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const lastTapRef = useRef(0)
  const [facingMode, setFacingMode] = useState('user')
  const [cameraMode, setCameraMode] = useState('story')
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [capturedBlob, setCapturedBlob] = useState(null)
  const [capturedUrl, setCapturedUrl] = useState(null)

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
      if (capturedUrl) {
        URL.revokeObjectURL(capturedUrl)
      }
    }
  }, [capturedUrl])

  const handleToggleCamera = () => {
    setFacingMode((current) => (current === 'user' ? 'environment' : 'user'))
  }
  const handleVideoTap = () => {
    if (capturedUrl) return

    const now = Date.now()
    if (now - lastTapRef.current <= 300) {
      lastTapRef.current = 0
      handleToggleCamera()
      return
    }

    lastTapRef.current = now
  }


  const handleShutter = () => {

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

    canvas.toBlob(
      (blob) => {
        if (!blob) return

        if (capturedUrl) {
          URL.revokeObjectURL(capturedUrl)
        }

        const url = URL.createObjectURL(blob)
        setCapturedBlob(blob)
        setCapturedUrl(url)
        haptic(20)
      },
      'image/jpeg',
      0.92
    )
  }

  const handleSave = () => {
    if (!capturedUrl) return

    const a = document.createElement('a')
    a.href = capturedUrl
    a.download = `unipicks-${Date.now()}.jpg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    haptic(10)
  }

  const handleShare = async () => {
    if (!capturedBlob) return

    const file = new File([capturedBlob], `unipicks-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    })

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error(error)
        }
      }
    } else {
      handleSave()
    }
  }

  const handleRetake = () => {
    if (capturedUrl) {
      URL.revokeObjectURL(capturedUrl)
    }

    setCapturedBlob(null)
    setCapturedUrl(null)
    haptic(10)
  }

  return (
    <div className="fixed inset-0 z-[100] flex min-h-[100dvh] flex-col bg-background text-foreground">
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4"
        style={{ paddingTop: 'calc(var(--safe-area-top) + 12px)' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close camera"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md"
        >
          <X size={24} />
        </button>

        <button
          type="button"
          onClick={handleToggleCamera}
          aria-label="Switch camera"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md"
        >
          <RefreshCw size={22} />
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />


      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        {permissionDenied ? (
          <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center text-white">
            <CameraOff size={48} />
            <p className="text-base">
              Camera access is needed to take photos. Enable it in your browser settings.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-accent px-6 py-3 font-medium text-accent-foreground"
            >
              Close
            </button>
          </div>
        ) : capturedUrl ? (
          <img
            src={capturedUrl}
            alt="Captured"
            className="h-full w-full object-contain"
          />
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
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center bg-gradient-to-t from-black/80 via-black/30 to-transparent px-4"
        style={{ paddingBottom: 'calc(var(--safe-area-bottom) + 16px)' }}
      >
        {capturedUrl ? (
          <div className="flex w-full items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleRetake}
              className="flex-1 rounded-full border border-white/30 bg-white/10 px-5 py-3 font-medium text-white backdrop-blur-md"
            >
              Retake
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="flex-1 rounded-full bg-accent px-5 py-3 font-medium text-accent-foreground"
            >
              Save
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="flex-1 rounded-full bg-accent px-5 py-3 font-medium text-accent-foreground"
            >
              Share
            </button>
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-center gap-8 text-sm font-medium text-white/60">
              <button
                type="button"
                onClick={() => setCameraMode('story')}
                className={cameraMode === 'story' ? 'text-accent' : 'text-white/60'}
              >
                Story
              </button>
              <button
                type="button"
                onClick={() => setCameraMode('post')}
                className={cameraMode === 'post' ? 'text-accent' : 'text-white/60'}
              >
                Post
              </button>
              <button
                type="button"
                onClick={() => setCameraMode('scan')}
                className={cameraMode === 'scan' ? 'text-accent' : 'text-white/60'}
              >
                Scan
              </button>
            </div>

            <button
              type="button"
              onClick={handleShutter}
              aria-label="Take photo"
              className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 p-1"
            >
              <span className="h-full w-full rounded-full bg-white" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}