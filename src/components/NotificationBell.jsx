import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { Bell } from 'lucide-react'

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const dropdownRef = useRef(null)

  useEffect(() => {
    let channel = null
    let pollTimer = null
    let active = true
    let subscribedUserId = null

    function stopSubscription() {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
      if (channel) supabase.removeChannel(channel)
      channel = null
      subscribedUserId = null
    }

    async function startSubscription(user) {
      if (!active || !user || subscribedUserId === user.id) return

      stopSubscription()
      subscribedUserId = user.id
      try {
        await fetchNotifications(user.id)
      } catch (error) {
        console.error('[notifications] initialization failed:', error)
        if (active) setLoading(false)
      }
      if (!active || subscribedUserId !== user.id) return

      channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `merchant_id=eq.${user.id}`,
          },
          (payload) => {
            setNotifications((prev) => {
              if (prev.some((notification) => notification.id === payload.new.id)) return prev
              return [payload.new, ...prev].slice(0, 20)
            })
            setUnreadCount((prev) => prev + 1)
          }
        )
        .subscribe((status, error) => {
          console.info('[notifications] realtime status:', status)
          if (error) console.error('[notifications] realtime error:', error)
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('[notifications] realtime unavailable; polling fallback is active')
          }
        })

      pollTimer = setInterval(() => fetchNotifications(user.id, false), 30000)
    }

    const { data: authListener, error: authListenerError } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        startSubscription(session.user).catch((error) => {
          console.error('[notifications] subscription setup failed:', error)
        })
      } else {
        stopSubscription()
        setNotifications([])
        setUnreadCount(0)
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
  }, [])

  async function fetchNotifications(userId, showLoading = true) {
    if (showLoading) setLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('merchant_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('[notifications] fetch failed:', error)
    } else {
      setNotifications(data || [])
      const unread = data?.filter((n) => !n.read).length || 0
      setUnreadCount(unread)
    }
    if (showLoading) setLoading(false)
  }

  async function markAsRead(notificationId) {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)

    if (!error) {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, read: true } : n
        )
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    }
  }

  async function markAllAsRead() {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('merchant_id', (await supabase.auth.getUser()).data.user.id)
      .eq('read', false)

    if (!error) {
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true }))
      )
      setUnreadCount(0)
    }
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
        aria-label="Notifications"
      >
        <Bell size={22} className="text-muted-foreground hover:text-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-card border border-border rounded-lg shadow-2xl z-50">
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
            <div className="p-8 text-center text-muted-foreground text-sm">
              <div className="text-4xl mb-2">🔔</div>
              No notifications yet
            </div>
          ) : (
            <div className="divide-y divide-base-700">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 hover:bg-card-alt transition cursor-pointer ${
                    !notification.read ? 'bg-accent/5 border-l-2 border-accent' : ''
                  }`}
                  onClick={() => markAsRead(notification.id)}
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
                      <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}