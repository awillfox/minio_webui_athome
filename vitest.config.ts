import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.spec.ts'],
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    // lib/config.ts calls loadConfig(process.env) at import time; provide
    // valid values so importing any module that touches config doesn't throw.
    env: {
      MINIO_INTERNAL_ENDPOINT: 'http://127.0.0.1:9100',
      MINIO_PUBLIC_ENDPOINT: 'http://100.86.43.70:9100',
      SESSION_SECRET: 'test-session-secret-at-least-32-characters',
    },
  },
  resolve: {
    alias: { '@': __dirname },
  },
})
