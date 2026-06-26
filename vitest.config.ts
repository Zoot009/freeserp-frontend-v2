import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Lightweight unit-test runner for pure logic (e.g. lib/seoScorer.ts). Not a
// component/DOM test setup — node environment is enough.
export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    // Mirror tsconfig's "@/*" -> "./*" alias so imports resolve under vitest.
    alias: { '@': path.resolve(__dirname) },
  },
})
