import { PGlite } from '@electric-sql/pglite'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

/**
 * The shared Drizzle surface. Both drivers implement it, so queries written
 * against `Db` run unchanged on PGlite locally and on Postgres in production.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

const MIGRATIONS_FOLDER = 'drizzle'

/**
 * An in-process Postgres for tests: no server, no shared state between suites.
 * PGlite is a real Postgres build, so enums, foreign keys, and transactions all
 * behave the way they will in production.
 */
export async function createTestDb(): Promise<Db> {
  const client = new PGlite()
  const db = drizzlePglite(client, { schema })
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER })
  return db as unknown as Db
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL

  // Without this guard a production deploy that forgot DATABASE_URL would fall
  // through to PGlite and quietly create an empty, per-instance, throwaway
  // database in the serverless filesystem. The app would look like it worked
  // while showing no data and losing every write — far worse than refusing to
  // start.
  if (!url && process.env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL tanımlı değil. Üretimde gömülü PGlite kullanılamaz — ' +
        'Vercel ortam değişkenlerine Postgres bağlantı dizesini ekleyin.',
    )
  }

  if (url) {
    // A page render fires many queries concurrently; `max: 1` serialises them
    // behind one socket, and a single stalled query then wedges the whole warm
    // instance forever. A small pool keeps one bad socket from taking every
    // request down with it — Supabase's transaction pooler is built for many
    // short-lived client connections. The timeouts matter on serverless:
    // `idle_timeout` closes our side before the upstream pooler kills the
    // socket under us, and `connect_timeout` turns an unreachable database
    // into an error in seconds instead of a hung request.
    const client = postgres(url, {
      max: 10,
      prepare: false,
      idle_timeout: 20,
      max_lifetime: 60 * 5,
      connect_timeout: 10,
    })
    return drizzlePg(client, { schema }) as unknown as Db
  }

  // No DATABASE_URL: local development against a PGlite file. Migrations run on
  // first connection so `npm run dev` works on a clean checkout.
  const client = new PGlite('.pglite')
  const db = drizzlePglite(client, { schema })
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER })
  return db as unknown as Db
}

// Next's dev server re-evaluates modules on every edit. Without memoising on
// globalThis each reload would open another PGlite instance against the same
// directory and eventually lock it.
const globalForDb = globalThis as unknown as { __novePysDb?: Promise<Db> }

export async function getDb(): Promise<Db> {
  globalForDb.__novePysDb ??= connect()
  try {
    return await globalForDb.__novePysDb
  } catch (err) {
    // A failed connect must not be memoised, or every later request inherits
    // the same rejection.
    globalForDb.__novePysDb = undefined
    throw err
  }
}

export * from './schema'
