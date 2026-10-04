import { supabase } from './supabaseClient.js'

// Phone notifications (Web Push, W3C Push API). The browser gives us a push
// subscription (an endpoint at Google/Apple/Mozilla + encryption keys); we
// save it with save_push_subscription() so Edge Functions can send alerts.
//
// Permission is asked only when the user taps the button, never on page load.
// Without VITE_VAPID_PUBLIC_KEY the feature is off and the card is hidden.

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

// States shown by PhoneAlertsCard.
export const PHONE_ALERTS = {
  unavailable: 'unavailable', // feature not configured: show nothing
  install: 'install', // iPhone/iPad in Safari: add to Home Screen first
  unsupported: 'unsupported', // this browser has no Web Push
  blocked: 'blocked', // the user blocked notifications for the site
  off: 'off',
  on: 'on',
}

function isIos() {
  const ua = navigator.userAgent || ''
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

function isInstalledApp() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
}

function browserSupportsPush() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function keyToBytes(base64Url) {
  const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration()
  return registration ? registration.pushManager.getSubscription() : null
}

async function saveSubscription(subscription) {
  const { keys } = subscription.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: keys?.p256dh,
    p_auth: keys?.auth,
    p_user_agent: navigator.userAgent.slice(0, 300),
  })
  if (error) throw new Error(error.message)
}

export async function getPhoneAlertsState() {
  if (!VAPID_PUBLIC_KEY) return PHONE_ALERTS.unavailable
  if (!browserSupportsPush()) {
    return isIos() && !isInstalledApp() ? PHONE_ALERTS.install : PHONE_ALERTS.unsupported
  }
  if (Notification.permission === 'denied') return PHONE_ALERTS.blocked

  const subscription = Notification.permission === 'granted' ? await currentSubscription() : null
  if (!subscription) return PHONE_ALERTS.off

  // Keep the server copy in sync (same phone, keys refreshed, row lost).
  await saveSubscription(subscription).catch((error) => console.error('[push] re-save failed:', error))
  return PHONE_ALERTS.on
}

// Called from a button tap. Returns the new state.
export async function turnOnPhoneAlerts() {
  const permission = await Notification.requestPermission()
  if (permission === 'denied') return PHONE_ALERTS.blocked
  if (permission !== 'granted') return PHONE_ALERTS.off

  const registration =
    (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'))
  await navigator.serviceWorker.ready

  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY),
    }))

  try {
    await saveSubscription(subscription)
  } catch (error) {
    await subscription.unsubscribe().catch(() => {})
    throw error
  }
  return PHONE_ALERTS.on
}

export async function turnOffPhoneAlerts() {
  const subscription = await currentSubscription()
  if (subscription) {
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
    if (error) throw new Error(error.message)
    await subscription.unsubscribe()
  }
  return PHONE_ALERTS.off
}

// Before signing out: stop this phone getting the account's alerts. Never
// blocks logout for more than 3 seconds, never throws.
export async function forgetThisPhone() {
  if (!VAPID_PUBLIC_KEY || !browserSupportsPush()) return
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000))
  await Promise.race([turnOffPhoneAlerts().catch((error) => console.error('[push] forget failed:', error)), timeout])
}
