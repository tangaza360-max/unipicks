// P3/B1: delete-my-account Edge Function. tombstone_user itself is covered by
// supabase/tests/delete_account.test.sh; here the RPC is faked.
// Run from the repo root:
//   deno test --import-map=supabase/functions/tests/import_map.json --allow-env --allow-read supabase/functions/tests/
import { assertEquals } from 'jsr:@std/assert@1'
import { db, resetDb } from './fakes/supabase.ts'
import * as serveStub from './fakes/serve.ts'
import { redactDbText } from '../delete-my-account/index.ts'

Deno.env.set('SUPABASE_URL', 'http://fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake')
Deno.env.set('SUPABASE_ANON_KEY', 'fake-anon')
await import('../delete-my-account/index.ts')
const handle = serveStub.handler!

const S = 'student-1'
const ADMIN = 'admin-1'
const OTHER = 'merchant-1'

const storageFor = (id: string) => [
  { bucket: 'deal-images', prefix: id },
  { bucket: 'deal-images', prefix: `merchants/${id}` },
  { bucket: 'merchant-logos', prefix: id },
  { bucket: 'story-images', prefix: `merchants/${id}` },
]

function seed() {
  resetDb()
  db.users[S] = { id: S, email: 'aline@keplercollege.ac.rw' }
  db.users[ADMIN] = { id: ADMIN, email: 'admin@unipicks.app' }
  db.tokens['tok-s'] = S
  db.tokens['tok-admin'] = ADMIN
  db.passwords['aline@keplercollege.ac.rw'] = 'correct horse'
  db.passwords['admin@unipicks.app'] = 'admin pass'
  db.tables.user_roles = [{ user_id: S, role: 'student' }, { user_id: ADMIN, role: 'admin' }]
  db.rpcs.tombstone_user = (args) => ({ data: { status: 'deleted', user_id: args.p_user_id, storage: storageFor(args.p_user_id) }, error: null })
  db.storage = {
    'deal-images': [`${OTHER}/a.jpg`, `${OTHER}/b.jpg`, `merchants/${OTHER}/ai.jpg`, 'someone-else/keep.jpg'],
    'merchant-logos': [`${OTHER}/logo.png`],
    'story-images': [`merchants/${OTHER}/s1.jpg`, `merchants/${S}-not-a-prefix-match/x.jpg`],
  }
}

const call = (token: string | null, body: unknown) =>
  handle(new Request('http://fake/delete-my-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }))

Deno.test('no token → 401, nothing deleted', async () => {
  seed()
  assertEquals((await call(null, { password: 'x' })).status, 401)
  assertEquals(db.rpcCalls.length, 0)
})

Deno.test('missing password → 400, nothing deleted', async () => {
  seed()
  const res = await call('tok-s', {})
  assertEquals(res.status, 400)
  assertEquals(db.rpcCalls.length, 0)
})

Deno.test('wrong password → 401, tombstone never called', async () => {
  seed()
  const res = await call('tok-s', { password: 'wrong' })
  assertEquals(res.status, 401)
  assertEquals((await res.json()).error, 'Incorrect password.')
  assertEquals(db.rpcCalls.length, 0)
})

Deno.test('correct password → tombstone_user(self, actor null) → 200', async () => {
  seed()
  const res = await call('tok-s', { password: 'correct horse' })
  assertEquals(res.status, 200)
  assertEquals((await res.json()).status, 'deleted')
  assertEquals(db.rpcCalls, [{ name: 'tombstone_user', args: { p_user_id: S, p_actor_id: null } }])
})

Deno.test('pre-check failure (P0001) → 409 with the database message; no storage touched', async () => {
  seed()
  db.rpcs.tombstone_user = () => ({ data: null, error: { code: 'P0001', message: 'You have active orders. Finish, collect or cancel them before deleting your account.' } })
  const before = JSON.stringify(db.storage)
  const res = await call('tok-s', { password: 'correct horse' })
  assertEquals(res.status, 409)
  assertEquals((await res.json()).error, 'You have active orders. Finish, collect or cancel them before deleting your account.')
  assertEquals(JSON.stringify(db.storage), before)
})

Deno.test('unexpected database error → 500 with a safe message (no internals leaked)', async () => {
  seed()
  db.rpcs.tombstone_user = () => ({ data: null, error: { code: 'XX000', message: 'internal detail' } })
  const res = await call('tok-s', { password: 'correct horse' })
  assertEquals(res.status, 500)
  assertEquals((await res.json()).error, 'Account deletion failed. Nothing was deleted; please try again.')
})

async function captureErrors(fn: () => Promise<void>) {
  const lines: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')) }
  try { await fn() } finally { console.error = original }
  return lines
}

Deno.test('unexpected error is logged as one line with code, message, details and hint — no password, email or phone', async () => {
  seed()
  db.rpcs.tombstone_user = () => ({
    data: null,
    error: {
      code: '23502',
      message: 'null value in column "x" of relation "y" violates not-null constraint',
      details: 'Failing row contains (aline@keplercollege.ac.rw, 0781234567, Aline).',
      hint: 'tombstone_user unexpected error; where: PL/pgSQL function tombstone_user_core(uuid,uuid) line 98 at SQL statement',
    },
  })
  let res: Response | undefined
  const lines = await captureErrors(async () => { res = await call('tok-s', { password: 'correct horse' }) })
  assertEquals(res!.status, 500)
  assertEquals((await res!.json()).code, '23502')
  const line = lines.find((l) => l.startsWith('[delete-my-account] tombstone_user failed '))!
  const logged = JSON.parse(line.replace('[delete-my-account] tombstone_user failed ', ''))
  assertEquals(logged, {
    mode: 'self',
    code: '23502',
    message: 'null value in column "x" of relation "y" violates not-null constraint',
    details: 'Failing row contains (redacted).',
    hint: 'tombstone_user unexpected error; where: PL/pgSQL function tombstone_user_core(uuid,uuid) line 98 at SQL statement',
  })
  for (const secret of ['correct horse', 'aline@keplercollege.ac.rw', '0781234567', S]) {
    assertEquals(lines.join('\n').includes(secret), false, `log contains ${secret}`)
  }
})

Deno.test('a 42501 flagged unexpected by tombstone_user (real permission error) → 500, not a 403 with the raw message', async () => {
  seed()
  db.rpcs.tombstone_user = () => ({
    data: null,
    error: { code: '42501', message: 'permission denied for table sessions', details: null, hint: 'tombstone_user unexpected error; where: ...' },
  })
  const res = await captureErrors(async () => {
    const r = await call('tok-s', { password: 'correct horse' })
    assertEquals(r.status, 500)
    assertEquals((await r.json()).error, 'Account deletion failed. Nothing was deleted; please try again.')
  })
  assertEquals(res.length, 1)
})

Deno.test('redactDbText strips emails, phone numbers, key values and failing rows', () => {
  assertEquals(redactDbText('Key (email)=(a@b.rw) already exists.'), 'Key (email)=(redacted) already exists.')
  assertEquals(redactDbText('value for +250 781 234 567 too long'), 'value for [number] too long')
  assertEquals(redactDbText('user x@y.z not allowed'), 'user [email] not allowed')
  assertEquals(redactDbText('relation "public.deal_searches" does not exist'), 'relation "public.deal_searches" does not exist')
  assertEquals(redactDbText(null), null)
})

Deno.test('admin mode: non-admin targeting someone else → 403, nothing deleted', async () => {
  seed()
  const res = await call('tok-s', { password: 'correct horse', target_user_id: OTHER })
  assertEquals(res.status, 403)
  assertEquals(db.rpcCalls.length, 0)
})

Deno.test('admin mode: admin password still required', async () => {
  seed()
  const res = await call('tok-admin', { password: 'wrong', target_user_id: OTHER })
  assertEquals(res.status, 401)
  assertEquals(db.rpcCalls.length, 0)
})

Deno.test('admin mode: deletes target with admin as actor and removes only their storage files', async () => {
  seed()
  const res = await call('tok-admin', { password: 'admin pass', target_user_id: OTHER })
  assertEquals(res.status, 200)
  assertEquals(db.rpcCalls, [{ name: 'tombstone_user', args: { p_user_id: OTHER, p_actor_id: ADMIN } }])
  assertEquals((await res.json()).storage, { removed: 5, complete: true })
  assertEquals(db.storage['deal-images'], ['someone-else/keep.jpg'])
  assertEquals(db.storage['merchant-logos'], [])
  assertEquals(db.storage['story-images'], [`merchants/${S}-not-a-prefix-match/x.jpg`])
})

Deno.test('retry after deletion (already_deleted) still runs storage cleanup', async () => {
  seed()
  db.rpcs.tombstone_user = (args) => ({ data: { status: 'already_deleted', storage: storageFor(args.p_user_id) }, error: null })
  const res = await call('tok-admin', { password: 'admin pass', target_user_id: OTHER })
  assertEquals(res.status, 200)
  assertEquals((await res.json()).status, 'already_deleted')
  assertEquals(db.storage['merchant-logos'], [])
})
