import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // PGlite ships a WASM build of Postgres. It must stay external to the server
  // bundle: bundling it breaks the .wasm/.data asset resolution at runtime.
  serverExternalPackages: ['@electric-sql/pglite'],
  // Production always runs on Postgres via DATABASE_URL — `lib/db` refuses to
  // start without it — so PGlite is unreachable code in a deployment. Left in
  // the trace it added ~16 MB (pglite.wasm, pglite.data) to every route's
  // function, paid back as cold-start latency on each one.
  outputFileTracingExcludes: {
    '**/*': ['node_modules/@electric-sql/pglite/**'],
  },
}

export default nextConfig
