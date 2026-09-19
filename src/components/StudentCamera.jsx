import { useEffect, useRef, useState } from 'react'
import { CameraOff, RefreshCw, X } from 'lucide-react'
import { haptic } from '../lib/haptics.js'

export default function StudentCamera({ onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [facingMode, setFacingMode] = useState('user')
  const [permissionDenied, setPermissionDenied] = useState(false)

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

  const handleToggleCamera = () => {
    setFacingMode((current) => (current === 'user' ? 'environment' : 'user'))
  }

  const handleShutter = () => {
    haptic(20)
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
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center bg-gradient-to-t from-black/80 via-black/30 to-transparent px-4"
        style={{ paddingBottom: 'calc(var(--safe-area-bottom) + 16px)' }}
      >
        <div className="mb-5 flex items-center gap-8 text-sm font-medium text-white/60">
          <button type="button" className="text-white">
            Story
          </button>
          <button type="button">Post</button>
          <button type="button">Scan</button>
        </div>

        <button
          type="button"
          onClick={handleShutter}
          aria-label="Take photo"
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 p-1"
        >
          <span className="h-full w-full rounded-full bg-white" />
        </button>
      </div>
    </div>
  )
}
