import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

const settingOrder = [
  'platform_name',
  'platform_description',
  'allow_merchant_registration',
  'allow_student_registration',
  'deal_approval_required',
  'max_discount_percent',
  'max_price_rwf',
  'contact_email',
]

function settingType(value) {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  return 'text'
}

function displayValue(value) {
  if (typeof value === 'string') return value
  return String(value ?? '')
}

export default function AdminSettings() {
  const [settings, setSettings] = useState([])
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    setError('')
    const { data, error: fetchError } = await supabase
      .from('system_settings')
      .select('*')

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    const ordered = [...(data || [])].sort((left, right) => {
      const leftIndex = settingOrder.indexOf(left.key)
      const rightIndex = settingOrder.indexOf(right.key)
      return (leftIndex < 0 ? settingOrder.length : leftIndex) - (rightIndex < 0 ? settingOrder.length : rightIndex)
    })
    setSettings(ordered)
    setDrafts(Object.fromEntries(ordered.map((setting) => [setting.id, setting.value])))
    setLoading(false)
  }

  function updateDraft(setting, nextValue) {
    setSuccess('')
    setDrafts((current) => ({ ...current, [setting.id]: nextValue }))
  }

  async function saveSettings() {
    setSaving(true)
    setError('')
    setSuccess('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Your session has expired. Please sign in again.')
      setSaving(false)
      return
    }

    const updates = settings.map((setting) => supabase
      .from('system_settings')
      .update({
        value: drafts[setting.id],
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq('id', setting.id))

    const results = await Promise.all(updates)
    const updateError = results.find((result) => result.error)?.error
    if (updateError) {
      setError(updateError.message)
    } else {
      await supabase.rpc('log_admin_action', {
        action: 'update_settings',
        target_type: 'system',
        target_name: 'System settings',
        details: { keys: settings.map((setting) => setting.key) },
      })
      setSuccess('Settings saved successfully.')
      await loadSettings()
    }
    setSaving(false)
  }

  if (loading) return <p className="text-muted-foreground text-sm">Loading settings...</p>
  if (error && settings.length === 0) return <p className="text-destructive text-sm">Could not load settings: {error}</p>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold text-foreground">System Settings</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage platform rules and contact details.</p>
      </div>

      <div className="grid gap-4">
        {settings.map((setting) => {
          const type = settingType(setting.value)
          const value = drafts[setting.id]
          return (
            <div key={setting.id} className="bg-card border border-border rounded-lg p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <label htmlFor={`setting-${setting.id}`} className="font-medium text-foreground">
                    {setting.key.replaceAll('_', ' ')}
                  </label>
                  <p className="text-muted-foreground text-sm mt-1">{setting.description || 'No description provided.'}</p>
                </div>

                {type === 'boolean' ? (
                  <label className="flex items-center gap-2 shrink-0 text-sm text-muted-foreground">
                    <input
                      id={`setting-${setting.id}`}
                      type="checkbox"
                      checked={value === true}
                      onChange={(event) => updateDraft(setting, event.target.checked)}
                      className="h-4 w-4 accent-accent"
                    />
                    Enabled
                  </label>
                ) : (
                  <input
                    id={`setting-${setting.id}`}
                    type={type}
                    value={displayValue(value)}
                    onChange={(event) => updateDraft(setting, type === 'number' ? Number(event.target.value) : event.target.value)}
                    className="field-input sm:max-w-xs"
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
      {success && <p className="text-accent text-sm" role="status">{success}</p>}

      <button
        type="button"
        onClick={saveSettings}
        disabled={saving}
        className="bg-primary text-primary-foreground font-semibold rounded-lg px-5 py-2.5 transition disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}
