// A small in-memory stand-in for Supabase (Auth, REST, RPC, Edge Functions),
// so end-to-end tests drive the real app without touching the real database.
// The app is built with VITE_SUPABASE_URL=http://fake-supabase.test; every
// request to that address lands here. Any request to a real *.supabase.co
// address is blocked and recorded, and the test fails (see fixtures.ts).
//
// It copies the server rules the flows depend on: email confirmation before
// log in, roles from user_roles, new businesses start unapproved, an
// unapproved business can't publish deals (RLS), orders need the business to
// accept, then payment, then a pickup code.
import type { Page, Route } from '@playwright/test'

export const FAKE_URL = 'http://fake-supabase.test'

type Row = Record<string, any>
type User = {
  id: string
  email: string
  password: string
  confirmed: boolean
  user_metadata: Row
  app_metadata: Row
  created_at: string
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const id = () => crypto.randomUUID()
const nowIso = (plusMinutes = 0) => new Date(Date.now() + plusMinutes * 60_000).toISOString()
const ALL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const PICKUP_CODE = '4821'

export const SEED = {
  business: { email: 'chips@example.rw', password: 'Chips-Kigali-2026!', name: 'Mr. Chips' },
  admin: { email: 'admin@unipicks.test', password: 'Admin-Kigali-2026!' },
  dealTitle: 'Burger Thursday',
}

export class FakeSupabase {
  users = new Map<string, User>()
  tables: Record<string, Row[]> = {}
  /** Requests that tried to reach a real Supabase project (must stay empty). */
  blocked: string[] = []
  private refresh = new Map<string, string>()

  constructor() {
    for (const t of ['deals', 'orders', 'redemptions', 'merchant_profiles', 'user_roles', 'activity_logs', 'notifications', 'user_notifications', 'transactions']) {
      this.tables[t] = []
    }
    // An approved business with one live deal (all days, all hours), and an admin.
    const owner = this.addUser(SEED.business.email, SEED.business.password, { role: 'merchant', full_name: 'Jean Habimana', business_name: SEED.business.name, phone: '0789310294' }, true)
    this.tables.merchant_profiles.push({ id: owner.id, business_name: SEED.business.name, phone: '0789310294', address: 'KG 374 St 10', rdb_number: '123456789', approved: true, logo_url: null, momo_pay_code: null, created_at: nowIso(-60 * 24 * 30) })
    this.tables.deals.push({
      id: id(), merchant_id: owner.id, business_name: SEED.business.name, title: SEED.dealTitle,
      description: '20% off every burger.', offer_type: 'percentage', price: 6000, discount_percent: 20,
      discount_value: null, final_price: null, buy_quantity: null, get_quantity: null, min_participants: null,
      tiered_rules: null, expires_at: null, active: true, image_url: null, available_days: ALL_DAYS,
      available_from: null, available_until: null, created_at: nowIso(-60 * 24),
    })
    const admin = this.addUser(SEED.admin.email, SEED.admin.password, { role: 'student', full_name: 'Unipicks Admin' }, true)
    this.role(admin.id).role = 'admin'
  }

  // ---- Things the other people do (the business, the admin, the email link) ----

  /** The person clicks the link in the confirmation email. */
  confirmEmail(email: string) {
    const u = this.userByEmail(email)
    if (!u) throw new Error(`No account for ${email}`)
    u.confirmed = true
    // The server sets the verified university from the email domain.
    if (email.endsWith('@keplercollege.ac.rw')) u.app_metadata.university = 'Kepler College'
  }

  /** The business accepts the newest waiting order (as it would in Orders). */
  businessAcceptsLatestOrder() {
    const order = [...this.tables.orders].reverse().find((o) => o.status === 'pending_confirmation')
    if (!order) throw new Error('No order is waiting for the business')
    Object.assign(order, { status: 'confirmed', payment_deadline: nowIso(5), updated_at: nowIso() })
    return order
  }

  /** The admin approves a business (as on Admin → Approvals). */
  approveBusiness(email: string) {
    const u = this.userByEmail(email)
    const profile = this.tables.merchant_profiles.find((p) => p.id === u?.id)
    if (!profile) throw new Error(`No business for ${email}`)
    profile.approved = true
  }

  /** A student's paid order at a business, ready for its pickup code to be checked. */
  seedPaidOrderWithCode(businessEmail: string) {
    const owner = this.userByEmail(businessEmail)
    const deal = this.tables.deals.find((d) => d.merchant_id === owner?.id)
    if (!owner || !deal) throw new Error(`${businessEmail} has no deal yet`)
    const student = this.addUser('eric@keplercollege.ac.rw', 'Eric-Kigali-2026!', { role: 'student', full_name: 'Eric Mugisha' }, true)
    const order = { id: id(), student_id: student.id, merchant_id: owner.id, deal_id: deal.id, quantity: 1, unit_price: deal.price, total_price: deal.price, status: 'paid', created_at: nowIso(-10), updated_at: nowIso(-5), merchant_phone: owner.user_metadata.phone }
    this.tables.orders.push(order)
    this.tables.redemptions.push({ id: id(), order_id: order.id, deal_id: deal.id, student_id: student.id, student_name: 'Eric Mugisha', code: PICKUP_CODE, status: 'pending', payment_status: 'paid', created_at: nowIso(-5) })
    return { code: PICKUP_CODE, dealTitle: deal.title, studentName: 'Eric Mugisha' }
  }

  /** A business that signed up and confirmed its email, waiting for approval. */
  addPendingBusiness(name: string, email: string) {
    const u = this.addUser(email, 'Pending-Kigali-2026!', { role: 'merchant', full_name: 'Marie Uwimana', business_name: name, phone: '0781234567' }, true)
    this.tables.merchant_profiles.push({ id: u.id, business_name: name, phone: '0781234567', address: 'KK 5 St', rdb_number: '987654321', approved: false, logo_url: null, momo_pay_code: null, created_at: nowIso() })
    return u
  }

  userByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email.toLowerCase())
  }

  // ---- Wiring into a Playwright page ----

  async install(page: Page) {
    await page.route(/^https?:\/\/[^/]*supabase\.co\//, (route) => {
      this.blocked.push(route.request().url())
      return route.abort()
    })
    await page.route(`${FAKE_URL}/**`, (route) => this.handle(route))
    await page.routeWebSocket(/fake-supabase\.test/, () => {})
    // Leaked-password check: answer "not leaked" without calling the real service.
    await page.route('https://api.pwnedpasswords.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: '' }))
  }

  private async handle(route: Route) {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    const user = this.userFromAuth(req.headers()['authorization'])
    const body = parse(req.postData())
    try {
      if (path.startsWith('/auth/v1/')) return await this.auth(route, path.slice(9), url, body, user)
      if (path.startsWith('/rest/v1/rpc/')) return json(route, this.rpc(path.slice(13), body ?? {}, user))
      if (path.startsWith('/rest/v1/')) return await this.rest(route, path.slice(9), url, body, user)
      if (path.startsWith('/functions/v1/')) return await this.fn(route, path.slice(14), body ?? {}, user)
      if (path.startsWith('/storage/v1/')) return json(route, [])
      return json(route, {})
    } catch (error) {
      // Like a `raise exception` in Postgres: status 400, the plain message.
      return json(route, { code: 'P0001', message: error instanceof Error ? error.message : String(error) }, 400)
    }
  }

  // ---- Auth (GoTrue) ----

  private addUser(email: string, password: string, metadata: Row, confirmed: boolean) {
    const u: User = { id: id(), email: email.toLowerCase(), password, confirmed, user_metadata: metadata, app_metadata: {}, created_at: nowIso() }
    this.users.set(u.id, u)
    // The database gives every new account its role (assign_initial_user_role).
    this.tables.user_roles.push({ user_id: u.id, role: metadata.role === 'merchant' ? 'merchant' : 'student', created_at: nowIso() })
    return u
  }

  private role(userId: string) {
    return this.tables.user_roles.find((r) => r.user_id === userId)!
  }

  private publicUser(u: User) {
    return {
      id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
      email_confirmed_at: u.confirmed ? u.created_at : null, user_metadata: u.user_metadata,
      app_metadata: { provider: 'email', ...u.app_metadata }, identities: [{ id: u.id, provider: 'email' }],
      created_at: u.created_at,
    }
  }

  private session(u: User) {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const refresh = id()
    this.refresh.set(refresh, u.id)
    return {
      access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, exp, role: 'authenticated', aud: 'authenticated', email: u.email })}.fake`,
      token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: refresh, user: this.publicUser(u),
    }
  }

  private userFromAuth(header?: string) {
    const token = header?.replace(/^Bearer /, '') ?? ''
    const parts = token.split('.')
    if (parts.length !== 3) return null
    try {
      return this.users.get(JSON.parse(Buffer.from(parts[1], 'base64url').toString()).sub) ?? null
    } catch {
      return null
    }
  }

  private async auth(route: Route, op: string, url: URL, body: Row | null, user: User | null) {
    if (op === 'signup') {
      const existing = this.userByEmail(body!.email)
      // Like Supabase with email confirmation on: an existing address gets a
      // user with no identities, and no email is sent.
      if (existing) return json(route, { ...this.publicUser(existing), identities: [] })
      const u = this.addUser(body!.email, body!.password, body!.data ?? {}, false)
      if (u.user_metadata.role === 'merchant') {
        this.tables.merchant_profiles.push({
          id: u.id, business_name: u.user_metadata.business_name, phone: u.user_metadata.phone,
          address: u.user_metadata.address, rdb_number: u.user_metadata.rdb_number,
          approved: false, logo_url: null, momo_pay_code: null, created_at: nowIso(),
        })
      }
      return json(route, this.publicUser(u)) // no session: "Check your email"
    }
    if (op.startsWith('token')) {
      const grant = url.searchParams.get('grant_type')
      if (grant === 'refresh_token') {
        const u = this.users.get(this.refresh.get(body!.refresh_token) ?? '')
        return u ? json(route, this.session(u)) : json(route, { code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }, 400)
      }
      const u = this.userByEmail(body!.email ?? '')
      if (!u || u.password !== body!.password) return json(route, { code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400)
      if (!u.confirmed) return json(route, { code: 'email_not_confirmed', msg: 'Email not confirmed' }, 400)
      return json(route, this.session(u))
    }
    if (op === 'user') return user ? json(route, this.publicUser(user)) : json(route, { msg: 'Invalid token' }, 401)
    if (op === 'logout') return route.fulfill({ status: 204 })
    return json(route, {})
  }

  // ---- REST (PostgREST) ----

  private async rest(route: Route, table: string, url: URL, body: any, user: User | null) {
    const req = route.request()
    const method = req.method()
    const rows = (this.tables[table] ??= [])
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const wantsRows = (req.headers()['prefer'] ?? '').includes('return=representation')
    const reply = (out: Row[]) => (single ? json(route, out[0] ?? null) : json(route, out, 200, out.length))

    if (method === 'GET' || method === 'HEAD') {
      return reply(this.embed(table, filterRows(rows, url.searchParams), url.searchParams.get('select')))
    }
    if (method === 'POST') {
      const added: Row[] = []
      for (const item of Array.isArray(body) ? body : [body]) {
        if (table === 'deals') {
          // RLS "Approved merchants can insert their own deals".
          const profile = this.tables.merchant_profiles.find((p) => p.id === user?.id)
          if (!profile?.approved || item.merchant_id !== user?.id) {
            return json(route, { code: '42501', message: 'new row violates row-level security policy for table "deals"' }, 403)
          }
        }
        const row = { id: id(), created_at: nowIso(), ...item }
        rows.push(row)
        added.push(row)
      }
      return wantsRows ? reply(added) : route.fulfill({ status: 201 })
    }
    if (method === 'PATCH') {
      const changed = filterRows(rows, url.searchParams)
      for (const r of changed) Object.assign(r, body)
      return wantsRows ? reply(changed) : route.fulfill({ status: 204 })
    }
    if (method === 'DELETE') {
      const gone = new Set(filterRows(rows, url.searchParams))
      this.tables[table] = rows.filter((r) => !gone.has(r))
      return route.fulfill({ status: 204 })
    }
    return json(route, {})
  }

  /** Embedded selects such as `deals(title)` or `redemptions(code)`. */
  private embed(table: string, rows: Row[], select: string | null) {
    const rels = [...(select ?? '').matchAll(/(\w+)\(/g)].map((m) => m[1])
    if (rels.length === 0) return rows
    return rows.map((row) => {
      const out = { ...row }
      for (const rel of rels) {
        const fk = `${rel.replace(/s$/, '')}_id`
        out[rel] = fk in row
          ? (this.tables[rel] ?? []).find((r) => r.id === row[fk]) ?? null
          : (this.tables[rel] ?? []).filter((r) => r[`${table.replace(/s$/, '')}_id`] === row.id)
      }
      return out
    })
  }

  // ---- Database functions (RPC) ----

  private rpc(name: string, args: Row, user: User | null): any {
    const role = user ? this.role(user.id)?.role : null
    const approved = this.tables.merchant_profiles.filter((p) => p.approved)
    switch (name) {
      case 'get_my_role':
        return role
      case 'get_businesses':
        return approved
          .filter((p) => !args.p_ids || args.p_ids.includes(p.id))
          .map((p) => ({ id: p.id, business_name: p.business_name, logo_url: p.logo_url, phone: role === 'student' ? p.phone : null, address: role === 'student' ? p.address : null }))
      case 'get_all_students':
      case 'get_all_merchants': {
        if (role !== 'admin') throw new Error('Only admins')
        const want = name === 'get_all_students' ? 'student' : 'merchant'
        return [...this.users.values()]
          .filter((u) => this.role(u.id)?.role === want)
          .map((u) => ({
            id: u.id, email: u.email, full_name: u.user_metadata.full_name ?? '', business_name: u.user_metadata.business_name ?? null,
            phone: u.user_metadata.phone ?? null, university: u.app_metadata.university ?? null,
            approved: this.tables.merchant_profiles.find((p) => p.id === u.id)?.approved ?? false,
            created_at: u.created_at, banned: false,
          }))
      }
      case 'log_admin_action':
        this.tables.activity_logs.push({ id: id(), admin_id: user?.id, admin_email: user?.email, admin_name: 'Unipicks Admin', action: args.action, target_type: args.target_type, target_id: args.target_id, target_name: args.target_name, details: args.details ?? {}, created_at: nowIso() })
        return null
      case 'redeem_pickup_code': {
        // Only the business that sold it, only a paid order, only once.
        const r = this.tables.redemptions.find((x) => x.code === args.p_code)
        const order = this.tables.orders.find((o) => o.id === r?.order_id)
        if (!r || !order || order.merchant_id !== user?.id || order.status !== 'paid') throw new Error('This code is not linked to a paid order')
        r.status = 'redeemed'
        order.status = 'redeemed'
        return [{ redemption_id: r.id }]
      }
      case 'get_setting':
        return null
      default:
        return []
    }
  }

  // ---- Edge Functions ----

  private async fn(route: Route, name: string, body: Row, user: User | null) {
    if (name === 'create-order') {
      const deal = this.tables.deals.find((d) => d.id === body.deal_id)
      if (!user || this.role(user.id)?.role !== 'student') return json(route, { error: 'Only students can order.' }, 403)
      if (!user.app_metadata.university) return json(route, { error: 'Only verified students can order.' }, 403)
      if (!deal?.active || deal.price == null) return json(route, { error: 'This deal does not have a valid price' }, 409)
      const unit = Math.round(deal.price * (1 - (deal.discount_percent ?? 0) / 100))
      const order = {
        id: id(), student_id: user.id, merchant_id: deal.merchant_id, deal_id: deal.id, quantity: body.quantity ?? 1,
        unit_price: unit, total_price: unit * (body.quantity ?? 1), status: 'pending_confirmation',
        confirmation_deadline: nowIso(5), payment_deadline: null, created_at: nowIso(), updated_at: nowIso(),
        merchant_phone: '0789310294', group_order_id: null,
      }
      this.tables.orders.push(order)
      return json(route, { order })
    }
    if (name === 'process-payment') {
      const order = this.tables.orders.find((o) => o.id === body.order_id && o.student_id === user?.id)
      if (!order || order.status !== 'confirmed') return json(route, { error: 'This order is not ready for payment.' }, 409)
      order.status = 'paid'
      this.tables.redemptions.push({ id: id(), order_id: order.id, deal_id: order.deal_id, student_id: order.student_id, student_name: user!.user_metadata.full_name, code: PICKUP_CODE, status: 'pending', payment_status: 'paid', created_at: nowIso() })
      return json(route, { status: 'paid' })
    }
    return json(route, { ok: true })
  }
}

function parse(text: string | null) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function json(route: Route, body: unknown, status = 200, count?: number) {
  const n = count ?? 1
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'content-range': `0-${Math.max(0, n - 1)}/${n}` },
    body: JSON.stringify(body),
  })
}

/** PostgREST filters used by the app: eq, neq, in, is (and not.*). */
function filterRows(rows: Row[], params: URLSearchParams) {
  let out = rows
  for (const [key, value] of params) {
    if (['select', 'order', 'limit', 'offset', 'or', 'and', 'on_conflict', 'columns'].includes(key)) continue
    const m = value.match(/^(not\.)?(eq|neq|in|is|gt|gte|lt|lte)\.(.*)$/)
    if (!m) continue
    const [, not, op, raw] = m
    out = out.filter((r) => {
      const x = r[key]
      let ok = true
      if (op === 'eq') ok = String(x) === raw
      else if (op === 'neq') ok = String(x) !== raw
      else if (op === 'in') ok = raw.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/"/g, '')).includes(String(x))
      else if (op === 'is') ok = raw === 'null' ? x == null : String(x) === raw
      else if (op === 'gt') ok = x > raw
      else if (op === 'gte') ok = x >= raw
      else if (op === 'lt') ok = x < raw
      else if (op === 'lte') ok = x <= raw
      return not ? !ok : ok
    })
  }
  const limit = params.get('limit')
  return limit ? out.slice(0, Number(limit)) : out
}
