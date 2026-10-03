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
} = { tables: {}, users: {}, tokens: {}, failInserts: {} }

export function resetDb() {
  db.tables = {}
  db.users = {}
  db.tokens = {}
  db.failInserts = {}
}

class Query {
  private filters: [string, (v: unknown) => boolean][] = []
  private max: number | null = null
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
    this.filters.push([col, (v) => v === value])
    return this
  }
  in(col: string, values: unknown[]) {
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
