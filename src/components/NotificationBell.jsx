import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { liveChannel } from '../lib/realtime.js'
import { Bell } from 'lucide-react'

// Dashboard bell for merchants and admins. It merges two inboxes:
//  - `notifications` (merchant order events: new order, payment received), and
//  - `user_notifications` (dispute raised / status changed, written by the
//    notify_dispute_change trigger for the merchant and every admin), which no
//    merchant or admin screen showed before.
// Items are normalised to { key, source, id, message, created_at, read, link_path }.

const LIMIT = 20

function fromMerchantInbox(row) {
  return { key: `n:${row.id}`, source: 'notifications', id: row.id, message: row.message, created_at: row.created_at, read: Boolean(row.read), link_path: null }
}

function fromUserInbox(row) {
  return { key: `u:${row.id}`, source: 'user_notifications', id: row.id, message: row.message, created_at: row.created_at, read: Boolean(row.is_read), link_path: row.link_path || null }
}

function mergeNewestFirst(items) {
  const seen = new Set()
  return items
    .filter((item) => (seen.has(item.key) ? false : seen.add(item.key)))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, LIMIT)
}

export default function NotificationBell({ includeMerchantInbox = true }) {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const dropdownRef = useRef(null)

  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    let channel = null
    let pollTimer = null
    let active = true
    let subscribedUserId = null

    let hadOutage = false

    function startPolling(currentUserId) {
      if (!pollTimer) pollTimer = setInterval(() => fetchNotifications(currentUserId, false), 30000)
    }

    function stopPolling() {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
    }

    function stopSubscription() {
      stopPolling()
      hadOutage = false
      if (channel) supabase.removeChannel(channel)
      channel = null
      subscribedUserId = null
    }

    function addLive(item) {
      setNotifications((prev) => mergeNewestFirst([item, ...prev]))
    }

    async function startSubscription(user) {
      if (!active || !user || subscribedUserId === user.id) return

      stopSubscription()
      subscribedUserId = user.id
      setUserId(user.id)
      try {
        await fetchNotifications(user.id)
      } catch (error) {
        console.error('[notifications] initialization failed:', error)
        if (active) setLoading(false)
      }
      if (!active || subscribedUserId !== user.id) return

      channel = liveChannel(`notifications:${user.id}`)
      if (includeMerchantInbox) {
        channel = channel.on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `merchant_id=eq.${user.id}` },
          (payload) => addLive(fromMerchantInbox(payload.new)),
        )
      }
      channel = channel
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${user.id}` },
          (payload) => addLive(fromUserInbox(payload.new)),
        )
        .subscribe((status, error) => {
          if (error) console.error('[notifications] realtime error:', error)
          if (!active || subscribedUserId !== user.id) return
          if (status === 'SUBSCRIBED') {
            // Live updates work, so there is no need to ask the server every
            // 30 seconds. After an outage, fetch once to catch up.
            const caughtUp = hadOutage
            hadOutage = false
            stopPolling()
            if (caughtUp) fetchNotifications(user.id, false)
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('[notifications] realtime unavailable; polling fallback is active')
            hadOutage = true
            startPolling(user.id)
          }
        })

      // Safety net until the live connection confirms it is working.
      startPolling(user.id)
    }

    const { data: authListener, error: authListenerError } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        startSubscription(session.user).catch((error) => {
          console.error('[notifications] subscription setup failed:', error)
        })
      } else {
        stopSubscription()
        setNotifications([])
        setUserId(null)
        setLoading(false)
      }
    })
    if (authListenerError) console.error('[notifications] auth listener failed:', authListenerError)

    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (error) console.error('[notifications] unable to get current user:', error)
      if (user) return startSubscription(user)
      if (active) setLoading(false)
    }).catch((error) => {
      console.error('[notifications] current user lookup failed:', error)
      if (active) setLoading(false)
    })

    return () => {
      active = false
      authListener?.subscription?.unsubscribe()
      stopSubscription()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeMerchantInbox])

  async function fetchNotifications(currentUserId, showLoading = true) {
    if (showLoading) setLoading(true)

    const [merchantResult, userResult] = await Promise.all([
      includeMerchantInbox
        ? supabase
          .from('notifications')
          .select('*')
          .eq('merchant_id', currentUserId)
          .order('created_at', { ascending: false })
          .limit(LIMIT)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('user_notifications')
        .select('id, message, created_at, is_read, link_path')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(LIMIT),
    ])

    if (merchantResult.error) console.error('[notifications] fetch failed:', merchantResult.error)
    if (userResult.error) console.error('[notifications] user inbox fetch failed:', userResult.error)

    if (!merchantResult.error || !userResult.error) {
      setNotifications(mergeNewestFirst([
        ...(merchantResult.data || []).map(fromMerchantInbox),
        ...(userResult.data || []).map(fromUserInbox),
      ]))
    }
    if (showLoading) setLoading(false)
  }

  async function markAsRead(item) {
    if (!item.read) {
      const { error } = item.source === 'notifications'
        ? await supabase.from('notifications').update({ read: true }).eq('id', item.id)
        : await supabase.from('user_notifications').update({ is_read: true }).eq('id', item.id)

      if (!error) {
        setNotifications((prev) => prev.map((n) => (n.key === item.key ? { ...n, read: true } : n)))
      }
    }

    if (item.link_path) {
      setIsOpen(false)
      navigate(item.link_path)
    }
  }

  async function markAllAsRead() {
    if (!userId) return
    const [merchantResult, userResult] = await Promise.all([
      includeMerchantInbox
        ? supabase.from('notifications').update({ read: true }).eq('merchant_id', userId).eq('read', false)
        : Promise.resolve({ error: null }),
      supabase.from('user_notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false),
    ])

    setNotifications((prev) => prev.map((n) => {
      const failed = n.source === 'notifications' ? merchantResult.error : userResult.error
      return failed ? n : { ...n, read: true }
    }))
  }

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-muted transition-colors"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={isOpen}
      >
        <Bell size={22} className="text-muted-foreground hover:text-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-96 overflow-y-auto bg-card border border-border rounded-2xl shadow-2xl z-50">
          <div className="sticky top-0 bg-card p-3 border-b border-border flex items-center justify-between">
            <span className="font-display font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-accent hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          {loading ? (
            <div className="p-4 text-center text-muted-foreground text-sm">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <Bell size={32} className="text-muted-foreground/50" />
              <span>No notifications yet</span>
            </div>
          ) : (
            <div className="divide-y divide-base-700">
              {notifications.map((notification) => (
                <button
                  type="button"
                  key={notification.key}
                  className={`block w-full text-left p-3 hover:bg-card-alt transition ${
                    !notification.read ? 'bg-accent/5 border-l-2 border-accent' : ''
                  }`}
                  onClick={() => markAsRead(notification)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground break-words">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(notification.created_at).toLocaleString()}
                      </p>
                    </div>
                    {!notification.read && (
                      <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0 mt-1.5" aria-hidden="true" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
