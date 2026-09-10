import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { PartyPopper } from 'lucide-react'

export default function MerchantPromoCreator() {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedContent, setGeneratedContent] = useState(null)
  const [selectedImage, setSelectedImage] = useState(null)
  const [selectedCopy, setSelectedCopy] = useState(null)
  const [error, setError] = useState('')
  const [step, setStep] = useState('prompt') // 'prompt' | 'review' | 'publish'

  async function handleGenerate() {
    if (!prompt.trim()) {
      setError('Please describe your deal.')
      return
    }

    setGenerating(true)
    setError('')

    // This is where we'll call the AI later
    // For now, we'll mock the response
    setTimeout(() => {
      const mockData = {
        copyOptions: [
          { title: 'Taco Tuesday Blowout', description: '20% off all tacos every Tuesday. Come hungry!' },
          { title: 'Tuesday Taco Madness', description: 'The best tacos in town, now 20% off. Every Tuesday.' },
          { title: 'Taco Lovers Unite', description: 'Show your love for tacos with 20% off every Tuesday.' },
        ],
        imageOptions: [
          'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=400&h=300&fit=crop',
          'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?w=400&h=300&fit=crop',
          'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&h=300&fit=crop',
          'https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=400&h=300&fit=crop',
        ]
      }

      setGeneratedContent(mockData)
      setSelectedImage(mockData.imageOptions[0])
      setSelectedCopy(mockData.copyOptions[0])
      setStep('review')
      setGenerating(false)
    }, 2000)
  }

  async function handlePublish() {
    // Save the selected deal to Supabase
    // For now, just show success
    setStep('publish')
  }

  // STEP 1: Prompt input
  if (step === 'prompt') {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Create a Deal with AI</h2>
          <p className="text-muted-foreground text-sm">
            Describe your deal in plain English — AI will generate marketing copy and images.
          </p>
        </div>

        <div className="bg-card-alt rounded-lg p-4">
          <label className="field-label">Describe your deal</label>
          <textarea
            className="field-input min-h-[120px]"
            placeholder="Example: 20% off all tacos every Tuesday. We are a cozy Mexican restaurant in town."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full bg-accent hover:bg-accent-dim text-background-foreground font-semibold rounded-lg py-3 transition disabled:opacity-50"
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span> Generating...
            </span>
          ) : (
            'Generate deal'
          )}
        </button>
      </div>
    )
  }

  // STEP 2: Review generated content
  if (step === 'review') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Review Your Deal</h2>
            <p className="text-muted-foreground text-sm">Select the copy and image you want to publish.</p>
          </div>
          <button
            onClick={() => setStep('prompt')}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Start over
          </button>
        </div>

        {/* Copy options */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Choose your copy</h3>
          <div className="grid grid-cols-1 gap-2">
            {generatedContent.copyOptions.map((copy, idx) => (
              <div
                key={idx}
                className={`border rounded-lg p-3 cursor-pointer transition ${
                  selectedCopy === copy
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-input'
                }`}
                onClick={() => setSelectedCopy(copy)}
              >
                <p className="font-medium text-sm">{copy.title}</p>
                <p className="text-muted-foreground text-xs">{copy.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Image options */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Choose your image</h3>
          <div className="grid grid-cols-2 gap-2">
            {generatedContent.imageOptions.map((url, idx) => (
              <div
                key={idx}
                className={`border rounded-lg overflow-hidden cursor-pointer transition ${
                  selectedImage === url
                    ? 'border-accent ring-2 ring-accent/50'
                    : 'border-border hover:border-input'
                }`}
                onClick={() => setSelectedImage(url)}
              >
                <img src={url} alt={`Option ${idx + 1}`} className="w-full h-32 object-cover" />
              </div>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="bg-card-alt rounded-lg p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Preview</h3>
          <div className="flex gap-4">
            <img src={selectedImage} alt="Selected" className="w-24 h-24 rounded-lg object-cover" />
            <div>
              <p className="font-semibold">{selectedCopy.title}</p>
              <p className="text-muted-foreground text-sm">{selectedCopy.description}</p>
            </div>
          </div>
        </div>

        <button
          onClick={handlePublish}
          className="w-full bg-accent hover:bg-accent-dim text-background-foreground font-semibold rounded-lg py-3 transition"
        >
          Publish deal
        </button>
      </div>
    )
  }

  // STEP 3: Success
  return (
    <div className="text-center space-y-4 py-8">
      <div className="flex justify-center"><PartyPopper size={48} className="text-accent" /></div>
      <h2 className="font-display text-2xl font-semibold">Deal Published!</h2>
      <p className="text-muted-foreground">
        Your deal is now live. Students can see it in their feed.
      </p>
      <button
        onClick={() => {
          setStep('prompt')
          setGeneratedContent(null)
          setPrompt('')
        }}
        className="bg-accent hover:bg-accent-dim text-background-foreground font-semibold rounded-lg px-6 py-2 transition"
      >
        Create another deal
      </button>
    </div>
  )
}