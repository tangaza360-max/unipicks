// Minimal in-memory stand-in for @supabase/supabase-js, covering only the
// query shapes the Edge Functions under test use. Tests mutate `db` directly.
// Untyped rows, like the real client without generated types.
// deno-lint-ignore no-explicit-any
type Row = any

export const db: {
  tables: Record<string, Row[]>
  users: Record<string, { id: string; email?: string; user_metadata?: Row; app_metadata?: Row }>
  tokens: Record<string, string>
  // Make the next N inserts into a table fail, to test error handling.
  failInserts: Record<string, number>
  // email -> password, for auth.signInWithPassword
  passwords: Record<string, string>
  // name -> handler, for rpc(); calls are recorded
  rpcs: Record<string, (args: Row) => { data: Row; error: Row }>
  rpcCalls: { name: string; args: Row }[]
  // bucket -> object paths, for storage.list/remove
  storage: Record<string, string[]>
  signIns: string[]
  // table -> its real column list. When set, selecting, filtering or writing
  // any other column fails with 42703, like PostgREST on the real schema.
  columns: Record<string, string[]>
} = { tables: {}, users: {}, tokens: {}, failInserts: {}, passwords: {}, rpcs: {}, rpcCalls: [], storage: {}, signIns: [], columns: {} }

export function resetDb() {
  db.tables = {}
  db.users = {}
  db.tokens = {}
  db.failInserts = {}
  db.passwords = {}
  db.rpcs = {}
  db.rpcCalls = []
  db.storage = {}
  db.signIns = []
  db.columns = {}
}

class Query {
  private filters: [string, (v: unknown) => boolean][] = []
  private max: number | null = null
  private op: 'select' | 'insert' | 'update' = 'select'
  private payload: Row | null = null
  private usedColumns: string[] = []

  constructor(private table: string) {}

  select(cols?: string) {
    if (cols && cols.trim() !== '*') {
      this.usedColumns.push(...cols.split(',').map((c) => c.trim()).filter(Boolean))
    }
    return this
  }
  insert(row: Row) {
    this.op = 'insert'
    this.payload = row
    this.usedColumns.push(...Object.keys(row ?? {}))
    return this
  }
  update(values: Row) {
    this.op = 'update'
    this.payload = values
    this.usedColumns.push(...Object.keys(values ?? {}))
    return this
  }
  eq(col: string, value: unknown) {
    this.usedColumns.push(col)
    this.filters.push([col, (v) => v === value])
    return this
  }
  in(col: string, values: unknown[]) {
    this.usedColumns.push(col)
    this.filters.push([col, (v) => values.includes(v)])
    return this
  }
  limit(n: number) {
    this.max = n
    return this
  }

  private rows() {
    return (db.tables[this.table] ??= [])
  }
  private run(): Row[] {
    const known = db.columns[this.table]
    const unknown = known && this.usedColumns.find((c) => !known.includes(c))
    if (unknown) {
      throw { code: '42703', message: `column ${this.table}.${unknown} does not exist` }
    }
    if (this.op === 'insert') {
      if ((db.failInserts[this.table] ?? 0) > 0) {
        db.failInserts[this.table] -= 1
        throw { message: `simulated insert failure on ${this.table}` }
      }
      const row = { id: crypto.randomUUID(), ...this.payload }
      this.rows().push(row)
      return [row]
    }
    const matched = this.rows().filter((r) => this.filters.every(([c, test]) => test(r[c])))
    if (this.op === 'update') matched.forEach((r) => Object.assign(r, this.payload))
    return this.max == null ? matched : matched.slice(0, this.max)
  }

  private safeRun(): { rows: Row[]; error: { message: string; code?: string } | null } {
    try {
      return { rows: this.run(), error: null }
    } catch (e) {
      return { rows: [], error: e as { message: string; code?: string } }
    }
  }

  single() {
    const { rows, error } = this.safeRun()
    if (error) return Promise.resolve({ data: null, error })
    return Promise.resolve(
      rows.length === 1
        ? { data: rows[0], error: null }
        : { data: null, error: { message: `expected 1 row, got ${rows.length}` } },
    )
  }
  maybeSingle() {
    const { rows, error } = this.safeRun()
    return Promise.resolve({ data: error ? null : rows[0] ?? null, error })
  }
  then<T>(resolve: (v: { data: Row[] | null; error: { message: string; code?: string } | null }) => T) {
    const { rows, error } = this.safeRun()
    return Promise.resolve(resolve({ data: error ? null : rows, error }))
  }
}

export function createClient(_url: string, _key: string, _options?: Row) {
  return {
    from: (table: string) => new Query(table),
    rpc: (name: string, args: Row) => {
      db.rpcCalls.push({ name, args })
      const handler = db.rpcs[name]
      return Promise.resolve(handler ? handler(args) : { data: null, error: { message: `no rpc ${name}` } })
    },
    storage: {
      from: (bucket: string) => ({
        // Lists direct children of a folder, like Supabase (files have an id).
        list: (prefix: string, _options?: Row): Promise<{ data: Row[]; error: Row }> => {
          const names = (db.storage[bucket] ?? [])
            .filter((p) => p.startsWith(`${prefix}/`) && !p.slice(prefix.length + 1).includes('/'))
            .map((p) => ({ name: p.slice(prefix.length + 1), id: crypto.randomUUID() }))
          return Promise.resolve({ data: names, error: null })
        },
        remove: (paths: string[]): Promise<{ data: Row; error: Row }> => {
          db.storage[bucket] = (db.storage[bucket] ?? []).filter((p) => !paths.includes(p))
          return Promise.resolve({ data: paths, error: null })
        },
      }),
    },
    auth: {
      signInWithPassword: ({ email, password }: { email: string; password: string }) => {
        db.signIns.push(email)
        const ok = db.passwords[email] !== undefined && db.passwords[email] === password
        return Promise.resolve(ok ? { data: {}, error: null } : { data: {}, error: { message: 'Invalid login credentials' } })
      },
      signOut: () => Promise.resolve({ error: null }),
      getUser: (token: string) => {
        const user = db.users[db.tokens[token]]
        return Promise.resolve(
          user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid token' } },
        )
      },
      admin: {
        getUserById: (id: string) => Promise.resolve({ data: { user: db.users[id] ?? null }, error: null }),
      },
    },
  }
}
