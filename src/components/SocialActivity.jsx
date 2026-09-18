import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bell,
  Check,
  CheckCheck,
  MessageCircle,
  UserPlus,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'

const TABS = [
  { id: 'notifications', label: 'Notifications' },
  { id: 'friends', label: 'Friend Requests' },
  { id: 'messages', label: 'Message Requests' },
]

export default function SocialActivity() {
  const [activeTab, setActiveTab] = useState('notifications')
  const [activity, setActivity] = useState({
    notifications: [],
    friend_requests: [],
    message_requests: [],
  })
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState('')
  const [error, setError] = useState('')

  const loadActivity = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data, error: activityError } = await supabase.rpc(
      'get_social_activity'
    )

    if (activityError) {
      console.error('Failed to load social activity:', activityError)
      setError('Unable to load your Social activity right now.')
      setLoading(false)
      return
    }

    setActivity({
      notifications: data?.notifications || [],
      friend_requests: data?.friend_requests || [],
      message_requests: data?.message_requests || [],
    })

    setLoading(false)
  }, [])

  useEffect(() => {
    loadActivity()
  }, [loadActivity])

  const unreadNotifications = useMemo(
    () => activity.notifications.filter((notification) => !notification.is_read),
    [activity.notifications]
  )

  const incomingFriendRequests = useMemo(
    () =>
      activity.friend_requests.filter(
        (request) => request.direction === 'incoming'
      ),
    [activity.friend_requests]
  )

  const incomingMessageRequests = useMemo(
    () =>
      activity.message_requests.filter(
        (request) => request.direction === 'incoming'
      ),
    [activity.message_requests]
  )

  async function markNotificationRead(notificationId) {
    const { error: updateError } = await supabase
      .from('social_notifications')
      .update({ is_read: true })
      .eq('id', notificationId)

    if (updateError) {
      console.error('Failed to mark notification as read:', updateError)
      return
    }

    setActivity((current) => ({
      ...current,
      notifications: current.notifications.map((notification) =>
        notification.id === notificationId
          ? { ...notification, is_read: true }
          : notification
      ),
    }))
  }

  async function markAllNotificationsRead() {
    if (unreadNotifications.length === 0) return

    setActionId('mark-all')

    const { error: updateError } = await supabase
      .from('social_notifications')
      .update({ is_read: true })
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
      .eq('is_read', false)

    if (updateError) {
      console.error(
        'Failed to mark all notifications as read:',
        updateError
      )
      setError('Unable to mark notifications as read.')
      setActionId('')
      return
    }

    setActivity((current) => ({
      ...current,
      notifications: current.notifications.map((notification) => ({
        ...notification,
        is_read: true,
      })),
    }))

    setActionId('')
  }

  async function runRequestAction(
    functionName,
    requestId,
    requestType,
    nextTab
  ) {
    const key = `${requestType}-${requestId}`
    setActionId(key)
    setError('')

    const { error: rpcError } = await supabase.rpc(functionName, {
      request_id: requestId,
    })

    if (rpcError) {
      console.error(`${functionName} failed:`, rpcError)
      setError(rpcError.message || 'Unable to complete that action.')
      setActionId('')
      return
    }

    await loadActivity()
    setActiveTab(nextTab)
    setActionId('')
  }

  function getNotificationText(notification) {
    const actor = notification.actor_display_name
      ? notification.actor_display_name
      : notification.actor_username
        ? `@${notification.actor_username}`
        : 'A student'

    switch (notification.type) {
      case 'friend_request':
        return `${actor} sent you a friend request.`

      case 'friend_request_accepted':
        return `${actor} accepted your friend request.`

      case 'message_request':
        return `${actor} wants to message you.`

      case 'message_request_accepted':
        return `${actor} accepted your message request.`

      default:
        return notification.message || 'You have a new Social notification.'
    }
  }

  function formatDate(value) {
    if (!value) return ''

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) return ''

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">
            Social Activity
          </h2>
          <p className="text-sm text-muted-foreground">
            Notifications and requests from other students.
          </p>
        </div>

        {unreadNotifications.length > 0 && (
          <button
            type="button"
            onClick={markAllNotificationsRead}
            disabled={actionId === 'mark-all'}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-border pb-2">
        {TABS.map((tab) => {
          const count =
            tab.id === 'notifications'
              ? unreadNotifications.length
              : tab.id === 'friends'
                ? incomingFriendRequests.length
                : incomingMessageRequests.length

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-2 rounded-full bg-background/20 px-2 py-0.5 text-xs">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
          Loading Social activity...
        </div>
      ) : (
        <>
          {activeTab === 'notifications' && (
            <div className="space-y-2">
              {activity.notifications.length === 0 ? (
                <div className="rounded-xl border border-border p-6 text-center">
                  <Bell className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">No notifications yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    New Social activity will appear here.
                  </p>
                </div>
              ) : (
                activity.notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`flex items-start gap-3 rounded-xl border border-border p-4 ${
                      notification.is_read ? '' : 'bg-muted/40'
                    }`}
                  >
                    <div className="mt-0.5 rounded-full bg-muted p-2">
                      <Bell className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        {getNotificationText(notification)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(notification.created_at)}
                      </p>
                    </div>

                    {!notification.is_read && (
                      <button
                        type="button"
                        onClick={() => markNotificationRead(notification.id)}
                        className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'friends' && (
            <div className="space-y-3">
              {activity.friend_requests.length === 0 ? (
                <div className="rounded-xl border border-border p-6 text-center">
                  <UserPlus className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">No friend requests</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Friend requests will appear here.
                  </p>
                </div>
              ) : (
                activity.friend_requests.map((request) => {
                  const key = `friend-${request.id}`

                  return (
                    <div
                      key={request.id}
                      className="flex items-center gap-3 rounded-xl border border-border p-4"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">
                        {request.display_name?.charAt(0)?.toUpperCase() || '?'}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{request.display_name}</p>
                        <p className="text-sm text-muted-foreground">
                          @{request.username}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {request.direction === 'incoming'
                            ? 'Wants to be your friend'
                            : 'Friend request sent'}
                        </p>
                      </div>

                      {request.direction === 'incoming' ? (
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              runRequestAction(
                                'accept_friend_request',
                                request.id,
                                'friend',
                                'friends'
                              )
                            }
                            disabled={actionId === key}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
                          >
                            <Check className="h-4 w-4" />
                            Accept
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              runRequestAction(
                                'decline_friend_request',
                                request.id,
                                'friend',
                                'friends'
                              )
                            }
                            disabled={actionId === key}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                          >
                            <X className="h-4 w-4" />
                            Decline
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            runRequestAction(
                              'cancel_friend_request',
                              request.id,
                              'friend',
                              'friends'
                            )
                          }
                          disabled={actionId === key}
                          className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {activeTab === 'messages' && (
            <div className="space-y-3">
              {activity.message_requests.length === 0 ? (
                <div className="rounded-xl border border-border p-6 text-center">
                  <MessageCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">No message requests</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Message requests will appear here.
                  </p>
                </div>
              ) : (
                activity.message_requests.map((request) => {
                  const key = `message-${request.id}`

                  return (
                    <div
                      key={request.id}
                      className="flex items-center gap-3 rounded-xl border border-border p-4"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">
                        {request.display_name?.charAt(0)?.toUpperCase() || '?'}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{request.display_name}</p>
                        <p className="text-sm text-muted-foreground">
                          @{request.username}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {request.direction === 'incoming'
                            ? 'Wants to message you'
                            : 'Message request sent'}
                        </p>
                      </div>

                      {request.direction === 'incoming' ? (
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              runRequestAction(
                                'accept_message_request',
                                request.id,
                                'message',
                                'messages'
                              )
                            }
                            disabled={actionId === key}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
                          >
                            <Check className="h-4 w-4" />
                            Accept
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              runRequestAction(
                                'decline_message_request',
                                request.id,
                                'message',
                                'messages'
                              )
                            }
                            disabled={actionId === key}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                          >
                            <X className="h-4 w-4" />
                            Decline
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            runRequestAction(
                              'cancel_message_request',
                              request.id,
                              'message',
                              'messages'
                            )
                          }
                          disabled={actionId === key}
                          className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
