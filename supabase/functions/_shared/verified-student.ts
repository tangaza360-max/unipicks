// Student prices are for verified students only. Used by create-order and
// create-group-order-payment, which write orders with the service role (so
// RLS can't check the caller).
//
// Verified = role 'student' in user_roles (server-owned) AND a university in
// app_metadata, which the set_verified_identity trigger derives from the email
// domain (P1, server-only). With Supabase email confirmation on, that email is
// also proven to belong to the user.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any

export const NOT_VERIFIED_STUDENT_ERROR =
  'Only verified students can order. Sign up with your university email to get student prices.'

export async function verifiedStudentError(
  supabaseAdmin: SupabaseClient,
  user: { id: string; app_metadata?: Record<string, unknown> | null },
): Promise<string | null> {
  const university = user.app_metadata?.university
  if (typeof university !== 'string' || university.trim() === '') {
    return NOT_VERIFIED_STUDENT_ERROR
  }

  const { data: roleRow, error } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw new Error(`Could not check account role: ${error.message}`)
  if (roleRow?.role !== 'student') return NOT_VERIFIED_STUDENT_ERROR

  return null
}
