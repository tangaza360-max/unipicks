import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function MerchantStories() {
  const [stories, setStories] = useState([])
  const [deals, setDeals] = useState([])
  const [caption, setCaption] = useState('')
  const [file, setFile] = useState(null)
  const [fileType, setFileType] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const uid = session.user.id
        setUserId(uid)
        loadStories(uid)
        loadDeals(uid)
      } else {
        console.error('❌ No session found')
      }
    }
    init()
  }, [])

  async function loadStories(uid) {
    setLoading(true)
    const { data, error } = await supabase
      .from('merchant_stories')
      .select('*')
      .eq('merchant_id', uid)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
    } else {
      setStories(data || [])
    }
    setLoading(false)
  }

  async function loadDeals(uid) {
    const { data, error } = await supabase
      .from('deals')
      .select('id, title, price, discount_percent')
      .eq('merchant_id', uid)
      .eq('active', true)
      .order('created_at', { ascending: false })

    if (!error) {
      setDeals(data || [])
    }
  }

  function finalPrice(deal) {
    if (!deal) return null
    if (deal.discount_percent == null) return deal.price
    return Math.round(deal.price * (1 - deal.discount_percent / 100))
  }

  function handleFileChange(e) {
    const selected = e.target.files?.[0]
    if (!selected) return
    setFile(selected)
    // Detect file type
    const type = selected.type
    if (type.startsWith('video/')) {
      setFileType('video')
    } else if (type === 'image/gif') {
      setFileType('image') // treat as image (will autoplay if GIF)
    } else {
      setFileType('image')
    }
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!file) return setError('Please select a file')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return setError('Not authenticated')

    const uid = session.user.id

    setUploading(true)
    setError('')

    try {
      const fileExt = file.name.split('.').pop()
      const filePath = `merchants/${uid}/${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('story-images')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage
        .from('story-images')
        .getPublicUrl(filePath)

      const payload = {
        merchant_id: uid,
        media_url: publicUrlData.publicUrl,
        caption: caption.trim() || null,
        type: fileType,
      }

      const { error: insertError } = await supabase
        .from('merchant_stories')
        .insert(payload)

      if (insertError) throw insertError

      setCaption('')
      setFile(null)
      setFileType('')
      loadStories(uid)
    } catch (err) {
      console.error('Upload error:', err)
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function deleteStory(id) {
    if (!confirm('Delete this story?')) return
    const { error } = await supabase
      .from('merchant_stories')
      .delete()
      .eq('id', id)

    if (!error) loadStories(userId)
  }

  if (!userId) {
    return <p className="text-muted-foreground text-sm">Loading user...</p>
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">📸 Stories</h2>
      <p className="text-sm text-muted-foreground">
        Post a story (image, GIF, or short video) that students will see at the top of their feed. Stories expire after 24 hours.
      </p>

      <form onSubmit={handleUpload} className="space-y-3 border border-border rounded-lg p-4">
        <div>
          <label className="field-label">Media (image, GIF, or video)</label>
          <input
            type="file"
            accept="image/*,video/*"
            onChange={handleFileChange}
            className="text-sm text-muted-foreground"
            required
          />
          <p className="text-xs text-muted-foreground mt-1">Supported: JPG, PNG, GIF, MP4, MOV</p>
        </div>

        <div>
          <label className="field-label">Caption (optional)</label>
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="What's new?"
            className="field-input"
            maxLength="100"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={uploading || !file}
          className="w-full bg-accent hover:bg-accent-dim text-background-foreground font-semibold rounded-lg py-2.5 transition disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : '📤 Post Story'}
        </button>
      </form>

      <div>
        <h3 className="font-medium text-sm mb-2">Your active stories</h3>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : stories.length === 0 ? (
          <p className="text-muted-foreground text-sm">No active stories.</p>
        ) : (
          <div className="space-y-2">
            {stories.map((story) => (
              <div key={story.id} className="flex items-center gap-3 border border-border rounded-lg p-3">
                {story.type === 'video' ? (
                  <video src={story.media_url} className="w-12 h-12 object-cover rounded-full" />
                ) : (
                  <img src={story.media_url} alt="Story" className="w-12 h-12 object-cover rounded-full" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">{story.caption || 'No caption'}</p>
                  <p className="text-xs text-muted-foreground">
                    Expires {new Date(story.expires_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => deleteStory(story.id)}
                  className="text-red-400 hover:text-red-500 text-sm"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
