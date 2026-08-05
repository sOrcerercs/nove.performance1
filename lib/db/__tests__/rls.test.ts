import { sql } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { createTestDb } from '../index'
import { departments } from '../schema'

/**
 * The statements scripts/supabase-rls.ts issues, verified against a real
 * Postgres (PGlite).
 *
 * The script itself talks TCP, so it cannot run here — but the SQL can, and
 * that is the part worth proving: that it is valid, that it actually flips
 * `pg_tables.rowsecurity`, that it skips the Supabase-only `anon` and
 * `authenticated` roles when they do not exist, and — most importantly — that
 * the application can still read its own data afterwards.
 */

const TABLES = [
  'departments',
  'users',
  'periods',
  'objectives',
  'key_results',
  'checkins',
  'login_attempts',
  'help_articles',
] as const

interface TableSecurity {
  tablename: string
  rowsecurity: boolean
}

/** `execute` returns a driver-shaped result; pglite wraps rows in `.rows`. */
function toRows(result: unknown): TableSecurity[] {
  if (Array.isArray(result)) return result as TableSecurity[]
  const rows = (result as { rows?: unknown }).rows
  return Array.isArray(rows) ? (rows as TableSecurity[]) : []
}

async function securityOf(db: Awaited<ReturnType<typeof createTestDb>>): Promise<TableSecurity[]> {
  const result = await db.execute(
    sql`select tablename, rowsecurity from pg_tables where schemaname = 'public'`,
  )
  return toRows(result).filter((r) => (TABLES as readonly string[]).includes(r.tablename))
}

const revokeIfRoleExists = (table: string) => sql.raw(`
  do $$
  begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute 'revoke all on public.${table} from anon';
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute 'revoke all on public.${table} from authenticated';
    end if;
  end $$;
`)

test('every application table starts without row-level security', async () => {
  const db = await createTestDb()
  const found = await securityOf(db)

  expect(found).toHaveLength(TABLES.length)
  // This is exactly the exposure the lockdown script closes.
  expect(found.every((r) => r.rowsecurity === false)).toBe(true)
})

test('the lockdown enables RLS on every table and is idempotent', async () => {
  const db = await createTestDb()

  for (const pass of [1, 2]) {
    for (const table of TABLES) {
      await db.execute(sql.raw(`alter table public.${table} enable row level security`))
      await db.execute(revokeIfRoleExists(table))
    }

    const found = await securityOf(db)

    expect(found, `pass ${pass}`).toHaveLength(TABLES.length)
    expect(found.every((r) => r.rowsecurity === true), `pass ${pass}`).toBe(true)
  }
})

test('the owner still reads and writes after the lockdown', async () => {
  const db = await createTestDb()

  for (const table of TABLES) {
    await db.execute(sql.raw(`alter table public.${table} enable row level security`))
  }

  // FORCE is deliberately not used, so the owner — which is how this app
  // connects — keeps full access. Without this the lockdown would take the
  // application down with the REST API.
  await db.insert(departments).values({
    id: 'rls-test', slug: 'rls-test', emoji: '🔒', nameTr: 'Test', nameEn: 'Test',
  })
  const rows = await db.select().from(departments)
  expect(rows.map((r) => r.id)).toContain('rls-test')
})
