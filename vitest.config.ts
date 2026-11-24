import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // the real package throws outside React Server Components
      'server-only': fileURLToPath(new URL('./test/empty.ts', import.meta.url)),
    },
  },
  test: { include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'] },
})
