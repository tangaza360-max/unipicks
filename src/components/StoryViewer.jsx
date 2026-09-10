import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

export default function StoryViewer({ stories, onClose, initialIndex = 0 }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [progress, setProgress] = useState(0)

  const currentStory = stories[currentIndex]

  useEffect(() => {
    if (!stories.length) return
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          goNext()
          return 0
        }
        return prev + 1
      })
    }, 50)

    return () => clearInterval(interval)
  }, [currentIndex])

  function goNext() {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setProgress(0)
    } else {
      onClose()
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setProgress(0)
    }
  }

  if (!currentStory) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
      <div className="relative max-w-lg w-full h-full max-h-[90vh] flex flex-col">
        {/* Progress bar */}
        <div className="flex gap-1 p-2">
          {stories.map((_, idx) => (
            <div key={idx} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-200"
                style={{
                  width: idx === currentIndex ? `${progress}%` : idx < currentIndex ? '100%' : '0%',
                }}
              />
            </div>
          ))}
        </div>

        {/* Image */}
        <div className="flex-1 flex items-center justify-center p-2 relative">
          <img
            src={currentStory.media_url}
            alt="Story"
            className="max-h-full max-w-full object-contain rounded-lg"
          />
        </div>

        {/* Caption & merchant name */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
          <div className="text-white">
            <p className="font-semibold">{currentStory.merchant?.business_name || 'Merchant'}</p>
            {currentStory.caption && (
              <p className="text-sm opacity-80">{currentStory.caption}</p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-white hover:text-gray-300">
            <X size={24} />
          </button>
        </div>

        {/* Tap zones */}
        <div className="absolute inset-0 flex">
          <div className="w-1/2 h-full" onClick={goPrev} />
          <div className="w-1/2 h-full" onClick={goNext} />
        </div>
      </div>
    </div>
  )
}
