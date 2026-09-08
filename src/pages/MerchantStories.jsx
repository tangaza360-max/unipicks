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
    const type = selected.type
    if (type.startsWith('video/')) {
      setFileType('video')
    } else if (type === 'image/gif') {
      setFileType('image')
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
          <span>📸</span> Stories
        </h2>
        <p className="text-muted-foreground text-sm">
          Share what's new with your customers. Stories disappear after 24 hours.
        </p>
      </div>

      {/* Upload form */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-6 hover:border-accent transition-colors">
            <input
              type="file"
              accept="image/*,video/*"
              onChange={handleFileChange}
              className="text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-accent file:text-background-foreground file:cursor-pointer hover:file:bg-accent-dim"
            />
            <p className="text-xs text-muted-foreground mt-2">JPG, PNG, GIF, MP4, MOV • Max 10 MB</p>
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
      </div>

      {/* Active stories */}
      <div>
        <h3 className="font-medium text-sm text-muted-foreground mb-3">
          Your active stories · {stories.length}
        </h3>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : stories.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-xl">
            <p className="text-muted-foreground text-sm">No active stories.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {stories.map((story) => (
              <div
                key={story.id}
                className="group relative border border-border rounded-xl overflow-hidden bg-card shadow-sm hover:shadow-md transition"
              >
                {story.type === 'video' ? (
                  <video
                    src={story.media_url}
                    className="w-full aspect-square object-cover"
                    muted
                  />
                ) : (
                  <img
                    src={story.media_url}
                    alt="Story"
                    className="w-full aspect-square object-cover"
                  />
                )}
                {/* Overlay with caption and delete */}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <p className="text-white text-xs truncate">{story.caption || 'Untitled'}</p>
                  <p className="text-white/60 text-[10px]">
                    {new Date(story.expires_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => deleteStory(story.id)}
                  className="absolute top-1 right-1 bg-black/50 hover:bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs transition"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
