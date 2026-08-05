import type { Config } from 'drizzle-kit'

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // `generate` only needs the dialect. `migrate` needs a real URL — set
  // DATABASE_URL in the shell when applying migrations to Supabase; the
  // placeholder below only keeps `generate` runnable without one. Locally the
  // app applies migrations itself against PGlite (see lib/db/index.ts).
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/nove' },
} satisfies Config
