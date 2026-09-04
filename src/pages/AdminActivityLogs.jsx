import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

const pageSize = 20

function humanize(value) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function AdminActivityLogs() {
  const [logs, setLogs] = useState([])
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('all')
  const [targetType, setTargetType] = useState('all')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadLogs() {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
      if (fetchError) setError(fetchError.message)
      else setLogs(data || [])
      setLoading(false)
    }
    loadLogs()
  }, [])

  const actions = useMemo(() => [...new Set(logs.map((log) => log.action))].sort(), [logs])
  const targetTypes = useMemo(() => [...new Set(logs.map((log) => log.target_type))].sort(), [logs])
  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase()
    return logs.filter((log) => {
      const matchesSearch = !query || [log.admin_name, log.admin_email, log.target_name, log.action]
        .some((value) => value?.toLowerCase().includes(query))
      return matchesSearch && (action === 'all' || log.action === action) && (targetType === 'all' || log.target_type === targetType)
    })
  }, [logs, search, action, targetType])

  const pageCount = Math.max(1, Math.ceil(filteredLogs.length / pageSize))
  const visibleLogs = filteredLogs.slice((page - 1) * pageSize, page * pageSize)

  function updateFilter(setter, value) {
    setter(value)
    setPage(1)
  }

  if (loading) return <p className="text-muted-foreground text-sm">Loading activity logs...</p>
  if (error) return <p className="text-destructive text-sm">Could not load activity logs: {error}</p>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold text-foreground">Activity Logs</h2>
        <p className="text-muted-foreground text-sm mt-1">Review administrative actions across the platform.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <input
          value={search}
          onChange={(event) => updateFilter(setSearch, event.target.value)}
          placeholder="Search admin, email, target, or action..."
          className="field-input"
        />
        <select value={action} onChange={(event) => updateFilter(setAction, event.target.value)} className="field-input sm:max-w-xs">
          <option value="all">All actions</option>
          {actions.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
        </select>
        <select value={targetType} onChange={(event) => updateFilter(setTargetType, event.target.value)} className="field-input sm:max-w-xs">
          <option value="all">All targets</option>
          {targetTypes.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
        </select>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
        {visibleLogs.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground text-sm">No activity logs found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Date</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Admin</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Action</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Target</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {visibleLogs.map((log) => (
                  <tr key={log.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3"><p className="text-foreground">{log.admin_name || 'Unknown admin'}</p><p className="text-muted-foreground text-xs">{log.admin_email || '—'}</p></td>
                    <td className="px-4 py-3 text-foreground">{humanize(log.action)}</td>
                    <td className="px-4 py-3"><p className="text-foreground">{log.target_name || '—'}</p><p className="text-muted-foreground text-xs">{humanize(log.target_type)}</p></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground"><details><summary className="cursor-pointer">View</summary><pre className="mt-2 whitespace-pre-wrap">{JSON.stringify(log.details, null, 2)}</pre></details></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Page {page} of {pageCount}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)} className="border border-border rounded-lg px-3 py-1.5 disabled:opacity-40">Previous</button>
          <button type="button" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)} className="border border-border rounded-lg px-3 py-1.5 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  )
}
