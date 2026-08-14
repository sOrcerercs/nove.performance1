import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    // jsdom for the component tests; the rest do not care.
    environment: 'jsdom',
    // The prototype bundle and its vendored copies of React live at the repo
    // root; they are not part of the app and must not be collected as tests.
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'app/**/*.test.ts',
      'app/**/*.test.tsx',
      'components/**/*.test.tsx',
    ],
    exclude: ['node_modules', '.next', 'build', 'prototype'],
    testTimeout: 30_000,
  },
})
