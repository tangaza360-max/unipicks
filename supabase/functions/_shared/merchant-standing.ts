// A merchant is "in good standing" when approved by an admin, not banned and
// not deleted. Used by the order functions (service role, so RLS can't check
// it) — mirrors public.is_merchant_in_good_standing (migration 20261003290000).

// deno-lint-ignore no-explicit-any
type SupabaseClient = any

export type MerchantStanding = 'ok' | 'not_approved' | 'banned' | 'deleted' | 'unknown'

export async function merchantStanding(
  supabaseAdmin: SupabaseClient,
  merchantId: string,
  merchantUser?: { app_metadata?: Record<string, unknown> | null } | null,
): Promise<MerchantStanding> {
  let user = merchantUser
  if (user === undefined) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(merchantId)
    if (error) throw new Error(`Could not load merchant account: ${error.message}`)
    user = data?.user ?? null
  }
  if (!user) return 'unknown'

  const app = user.app_metadata ?? {}
  if (app.deleted_at) return 'deleted'
  if (app.banned === true || String(app.banned).toLowerCase() === 'true') return 'banned'

  const { data: profile, error } = await supabaseAdmin
    .from('merchant_profiles')
    .select('approved')
    .eq('id', merchantId)
    .maybeSingle()
  if (error) throw new Error(`Could not check merchant approval: ${error.message}`)
  if (!profile?.approved) return 'not_approved'

  return 'ok'
}

export const MERCHANT_UNAVAILABLE_ERROR = "This business isn't taking orders right now."
