// P3 / B1: delete the caller's account (or, for admins, another account).
//
// 1. Authenticate the caller (Bearer token).
// 2. Re-verify the caller's password (decision D2; also required for admins).
// 3. tombstone_user(): one database transaction that runs the pre-checks,
//    deletes personal/social data, anonymises kept records, tombstones the auth
//    user and signs out every session. See
//    supabase/migrations/20261003220000_delete_account_tombstone.sql.
// 4. Remove the account's storage files via the Storage API (deleting
//    storage.objects rows in SQL would leave the files behind). Idempotent:
//    a retry re-runs cleanup because tombstone_user returns 'already_deleted'.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Pre-check failures raised by tombstone_user, safe to show to the user.
const USER_FACING_ERRORS: Record<string, number> = {
  P0001: 409, // active orders / open dispute / open group order
  '42501': 403, // admin accounts
  P0002: 404, // user not found
}

type StorageTarget = { bucket: string; prefix: string }

async function removeStorage(targets: StorageTarget[]) {
  let removed = 0
  const errors: string[] = []

  for (const { bucket, prefix } of targets) {
    const { data: files, error: listError } = await supabaseAdmin.storage
      .from(bucket)
      .list(prefix, { limit: 1000 })

    if (listError) {
      errors.push(`${bucket}/${prefix}: ${listError.message}`)
      continue
    }

    const paths = (files ?? [])
      .filter((f: { name: string; id?: string | null }) => f.name && f.id !== null)
      .map((f: { name: string }) => `${prefix}/${f.name}`)

    if (paths.length === 0) continue

    const { error: removeError } = await supabaseAdmin.storage.from(bucket).remove(paths)
    if (removeError) {
      errors.push(`${bucket}/${prefix}: ${removeError.message}`)
    } else {
      removed += paths.length
    }
  }

  return { removed, errors }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const { data: { user }, error: authError } =
      await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const password: unknown = body?.password
    const targetUserId: string = typeof body?.target_user_id === 'string' && body.target_user_id
      ? body.target_user_id
      : user.id
    const isAdminAction = targetUserId !== user.id

    if (typeof password !== 'string' || password.length === 0) {
      return json({ error: 'Please enter your password to confirm.' }, 400)
    }

    if (isAdminAction) {
      const { data: callerRole } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()

      if (callerRole?.role !== 'admin') {
        return json({ error: 'Only admins can delete other accounts.' }, 403)
      }
    }

    // Re-verify the caller's password with a separate, non-persistent client.
    if (!user.email) return json({ error: 'This account has no email to verify.' }, 400)
    const verifier = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: passwordError } = await verifier.auth.signInWithPassword({
      email: user.email,
      password,
    })
    if (passwordError) return json({ error: 'Incorrect password.' }, 401)
    // In self-service mode this extra session is removed by the tombstone;
    // for admins, end it straight away.
    if (isAdminAction) await verifier.auth.signOut()

    const { data: result, error: rpcError } = await supabaseAdmin.rpc('tombstone_user', {
      p_user_id: targetUserId,
      p_actor_id: isAdminAction ? user.id : null,
    })

    if (rpcError) {
      const status = USER_FACING_ERRORS[rpcError.code ?? '']
      if (status) return json({ error: rpcError.message }, status)
      console.error('[delete-my-account] tombstone_user failed:', rpcError)
      return json({ error: 'Account deletion failed. Nothing was deleted; please try again.' }, 500)
    }

    // Database deletion is complete. Storage cleanup is best-effort and retryable.
    const storage = await removeStorage((result?.storage ?? []) as StorageTarget[])
    if (storage.errors.length > 0) {
      console.error('[delete-my-account] storage cleanup incomplete:', storage.errors)
    }

    return json({
      status: result?.status ?? 'deleted',
      user_id: targetUserId,
      storage: { removed: storage.removed, complete: storage.errors.length === 0 },
    })
  } catch (error) {
    console.error('[delete-my-account] unexpected error:', error)
    return json({ error: 'Unexpected server error' }, 500)
  }
})
