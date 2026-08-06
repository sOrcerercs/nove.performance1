import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
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
 * PGlite is a ~16 MB WebAssembly build of Postgres, and it is only ever used by
 * the test suite and by `npm run dev` on a checkout with no DATABASE_URL.
 * Importing it at module scope put those megabytes into all ten route bundles,
 * where they were paid back as cold-start latency on every one. Loading it on
 * demand keeps it out; `next.config.ts` drops it from the deployment trace for
 * the same reason. Production cannot reach this path regardless — `connect()`
 * refuses to start without DATABASE_URL.
 */
async function connectPglite(
  dataDir: string | undefined,
  onQuery?: (sql: string) => void,
): Promise<Db> {
  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('drizzle-orm/pglite'),
    import('drizzle-orm/pglite/migrator'),
  ])

  const db = drizzle(new PGlite(dataDir), {
    schema,
    logger: onQuery ? { logQuery: (query) => onQuery(query) } : undefined,
  })
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  return db as unknown as Db
}

/**
 * An in-process Postgres for tests: no server, no shared state between suites.
 * PGlite is a real Postgres build, so enums, foreign keys, and transactions all
 * behave the way they will in production.
 *
 * `onQuery` receives every statement the suite issues. It exists so tests can
 * assert on the *number* of roundtrips a render costs, not just its output —
 * duplicate queries are invisible to result-based assertions.
 */
export function createTestDb(opts?: { onQuery?: (sql: string) => void }): Promise<Db> {
  return connectPglite(undefined, opts?.onQuery)
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
    //
    // `max` is also a correctness floor, not just a throughput knob. postgres.js
    // queues statements past the pool's connection count, and against the
    // transaction pooler a queued statement is never sent at all: measured
    // against the live database, 1 connection with 2 concurrent statements
    // never returns, while 8 with 8 returns in 452ms. So the pool has to stay
    // above the widest fan-out any single request performs — five reads, one
    // per table, held there by lib/queries/__tests__/request-dedup.test.ts.
    const client = postgres(url, {
      max: 10,
      prepare: false,
      idle_timeout: 20,
      max_lifetime: 60 * 5,
      connect_timeout: 10,
      // Skips the type-catalogue roundtrip each new connection would otherwise
      // pay — which is every connection, given `idle_timeout`. The schema uses
      // no custom types beyond enums, and those decode as strings either way.
      fetch_types: false,
    })
    return drizzlePg(client, { schema }) as unknown as Db
  }

  // No DATABASE_URL: local development against a PGlite file. Migrations run on
  // first connection so `npm run dev` works on a clean checkout.
  return connectPglite('.pglite')
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
