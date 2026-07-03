import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  // The dev server compiles routes on first hit, so the first test after a cold
  // start can time out on the login→/buckets redirect. One retry absorbs that
  // dev-mode warmup flake (production routes are pre-built).
  retries: 1,
  use: { baseURL: 'http://127.0.0.1:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/login',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
