import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // PGlite ships a WASM build of Postgres. It must stay external to the server
  // bundle: bundling it breaks the .wasm/.data asset resolution at runtime.
  serverExternalPackages: ['@electric-sql/pglite'],
}

export default nextConfig
