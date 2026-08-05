/**
 * Runs at the start of `npm run build` so a Vercel deploy prepares its own
 * database: migrations always, seed only when the database is empty.
 *
 * Without DATABASE_URL (a local `next build`, CI without secrets) it does
 * nothing — the deploy-time work belongs only to environments that have a
 * real database to prepare.
 *
 * The seed wipes and rewrites every table, so it must never run against a
 * database that already has users: an empty `users` table is the one signal
 * that this is a first boot and not a redeploy over live data.
 */
import { readFileSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { canSignIn } from '../lib/domain/types'
import type { Db } from '../lib/db/index'
import * as schema from '../lib/db/schema'
import { seed } from '../lib/db/seed'
import { SEED_USERS } from '../lib/db/seed-data'

const url = process.env.DATABASE_URL

if (!url) {
  console.log('deploy-db: DATABASE_URL yok, migration ve seed atlandı.')
  process.exit(0)
}

// Same connection settings as the app (lib/db/index.ts): Supabase's
// transaction pooler rejects prepared statements, so `prepare: false`.
const client = postgres(url, { max: 1, prepare: false, connect_timeout: 15 })
const db = drizzle(client, { schema }) as unknown as Db

/**
 * Concurrent builds (a push racing a redeploy) both running the migrator
 * deadlock on its DDL locks until statement_timeout kills one and fails that
 * build. Reading the journal first lets an up-to-date database skip the
 * migrator — and its locks — entirely, which is every deploy after the first.
 */
async function pendingMigrations(): Promise<number> {
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
    entries: unknown[]
  }
  try {
    const rows = await client<{ count: number }[]>`
      select count(*)::int as count from drizzle.__drizzle_migrations`
    return Math.max(0, journal.entries.length - Number(rows[0]?.count ?? 0))
  } catch {
    // No migrations table yet: everything is pending.
    return journal.entries.length
  }
}

if ((await pendingMigrations()) === 0) {
  console.log('deploy-db: migration güncel, atlandı.')
} else {
  // Transient pooler stalls were failing entire builds; a short lock wait plus
  // retries rides them out instead.
  const attempts = 3
  for (let i = 1; i <= attempts; i++) {
    try {
      console.log(`deploy-db: migration uygulanıyor… (deneme ${i}/${attempts})`)
      await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: 'drizzle' })
      console.log('deploy-db: migration tamam.')
      break
    } catch (err) {
      if (i === attempts) throw err
      console.log(`deploy-db: migration denemesi başarısız (${(err as Error).message}), 20 sn sonra tekrar…`)
      await new Promise((r) => setTimeout(r, 20_000))
    }
  }
}

const existing = await db.select({ id: schema.users.id }).from(schema.users).limit(1)

if (existing.length > 0) {
  console.log('deploy-db: veritabanında kullanıcı var, seed atlandı.')
} else {
  console.log('deploy-db: veritabanı boş, seed çalıştırılıyor…')
  const { password } = await seed(db)

  console.log('\ndeploy-db: giriş yapabilen hesaplar:')
  for (const u of SEED_USERS.filter((u) => canSignIn(u.role))) {
    console.log(`  ${u.role.padEnd(10)} ${u.email}`)
  }
  console.log(
    process.env.SEED_PASSWORD
      ? '\ndeploy-db: parola SEED_PASSWORD ortam değişkeninden alındı.'
      : `\ndeploy-db: parola (hepsi için aynı): ${password}\n` +
          'deploy-db: bu parola yalnızca bu build logunda görünür — kaydedin.',
  )
}

await client.end()
process.exit(0)
