// Where Supabase auth emails (confirm signup, and later password reset or
// email change) send the user back to. Always pass this explicitly
// (emailRedirectTo / redirectTo) instead of relying on the dashboard
// "Site URL", which once still pointed at localhost in production.
// The URL must also match an entry in Supabase → Authentication → URL
// Configuration → Redirect URLs, or Supabase falls back to the Site URL.
export function appUrl(path = '/') {
  // In production this is the deployed origin; in dev, the local origin.
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}${path}`
}
