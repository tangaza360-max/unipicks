import { supabase } from './supabaseClient.js'

// Open a Supabase realtime channel with a name no other channel uses.
// supabase.channel(name) returns an existing channel with the same name if
// one is still open; a screen that restarts its live updates (after a login
// renewal, a fast tab switch, or React's development double-run) could get
// the old, already-started channel back and fail with "cannot add
// postgres_changes callbacks ... after subscribe()" (Sentry UNIPICKS-WEB-2).
// The name is only a label: what a channel receives is set by its .on()
// filters, so a unique suffix changes nothing else.
let counter = 0

export function liveChannel(name) {
  counter += 1
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${counter}`
  return supabase.channel(`${name}:${suffix}`)
}
