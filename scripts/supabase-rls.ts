/**
 * Locks the application tables away from Supabase's public REST API.
 *
 *   DATABASE_URL="postgres://..." npm run supabase:rls
 *
 * Why this is needed: Supabase publishes a PostgREST endpoint over every table
 * in `public`, reachable with the `anon` key — a key that is designed to be
 * public. Tables created by an external migration tool (Drizzle, here) arrive
 * with row-level security *disabled*, so employee records and commercial
 * targets would be readable by anyone holding that key. This app never uses
 * that API, so the correct posture is to close it entirely.
 *
 * Enabling RLS with no policies denies `anon` and `authenticated` everything.
 * It does not affect this app: it connects as the table owner, and Postgres
 * exempts owners from RLS unless FORCE is used — which is deliberately avoided
 * here, since forcing it would lock the application out of its own data.
 *
 * Idempotent, so it is safe to re-run after every migration that adds a table.
 */
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('\nDATABASE_URL gerekli.')
  console.error("Örnek: DATABASE_URL='postgres://...' npm run supabase:rls\n")
  process.exit(1)
}

/** Every table this app owns. Keep in step with lib/db/schema.ts. */
const TABLES = [
  'departments',
  'users',
  'periods',
  'objectives',
  'key_results',
  'checkins',
  'kr_monthly_values',
  'login_attempts',
  'help_articles',
  'app_settings',
  // Drizzle's own bookkeeping table lives in its own schema, not public.
] as const

const sql = postgres(url, { max: 1, prepare: false })

try {
  const present = await sql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public'
  `
  const presentNames = new Set(present.map((r) => r.tablename))

  const missing = TABLES.filter((t) => !presentNames.has(t))
  if (missing.length > 0) {
    console.error(`\nŞu tablolar yok: ${missing.join(', ')}`)
    console.error('Önce migration çalıştırın: npx drizzle-kit migrate\n')
    process.exit(1)
  }

  for (const table of TABLES) {
    // No FORCE: the owner must keep full access, that is how the app reads.
    await sql`alter table ${sql(`public.${table}`)} enable row level security`

    // Belt and braces — RLS alone is enough, but removing the grants means the
    // REST layer cannot even see the table.
    await sql.unsafe(`
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

    console.log(`  ✓ ${table}`)
  }

  const check = await sql<{ tablename: string; rowsecurity: boolean }[]>`
    select tablename, rowsecurity
    from pg_tables
    where schemaname = 'public'
    order by tablename
  `

  const open = check.filter((r) => !r.rowsecurity)
  console.log('\nRLS durumu:')
  for (const r of check) console.log(`  ${r.rowsecurity ? 'kapalı' : 'AÇIK  '}  ${r.tablename}`)

  if (open.length > 0) {
    console.error(`\nUYARI: ${open.map((r) => r.tablename).join(', ')} hâlâ RLS'siz.\n`)
    process.exit(1)
  }

  console.log('\nTüm tablolar public REST API’sine kapatıldı.')
  console.log('Uygulama tablo sahibi olarak bağlandığı için etkilenmez.\n')
} finally {
  await sql.end()
}

process.exit(0)
