// Minimal in-memory stand-in for @supabase/supabase-js, covering only the
// query shapes the Edge Functions under test use. Tests mutate `db` directly.
// Untyped rows, like the real client without generated types.
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>

export const db: {
  tables: Record<string, Row[]>
  users: Record<string, { id: string; email?: string; user_metadata?: Row }>
  tokens: Record<string, string>
} = { tables: {}, users: {}, tokens: {} }

export function resetDb() {
  db.tables = {}
  db.users = {}
  db.tokens = {}
}

class Query {
  private filters: [string, unknown][] = []
  private op: 'select' | 'insert' | 'update' = 'select'
  private payload: Row | null = null

  constructor(private table: string) {}

  select(_cols?: string) {
    return this
  }
  insert(row: Row) {
    this.op = 'insert'
    this.payload = row
    return this
  }
  update(values: Row) {
    this.op = 'update'
    this.payload = values
    return this
  }
  eq(col: string, value: unknown) {
    this.filters.push([col, value])
    return this
  }

  private rows() {
    return (db.tables[this.table] ??= [])
  }
  private run(): Row[] {
    if (this.op === 'insert') {
      const row = { id: crypto.randomUUID(), ...this.payload }
      this.rows().push(row)
      return [row]
    }
    const matched = this.rows().filter((r) => this.filters.every(([c, v]) => r[c] === v))
    if (this.op === 'update') matched.forEach((r) => Object.assign(r, this.payload))
    return matched
  }

  single() {
    const rows = this.run()
    return Promise.resolve(
      rows.length === 1
        ? { data: rows[0], error: null }
        : { data: null, error: { message: `expected 1 row, got ${rows.length}` } },
    )
  }
  maybeSingle() {
    const rows = this.run()
    return Promise.resolve({ data: rows[0] ?? null, error: null })
  }
  then<T>(resolve: (v: { data: Row[]; error: null }) => T, reject?: (e: unknown) => T) {
    try {
      return Promise.resolve(resolve({ data: this.run(), error: null }))
    } catch (e) {
      return reject ? Promise.resolve(reject(e)) : Promise.reject(e)
    }
  }
}

export function createClient(_url: string, _key: string) {
  return {
    from: (table: string) => new Query(table),
    auth: {
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
