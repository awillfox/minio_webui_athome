import { describe, it, expect } from 'vitest'
import { loadConfig } from '@/lib/config'

const good = {
  MINIO_INTERNAL_ENDPOINT: 'http://127.0.0.1:9100',
  MINIO_PUBLIC_ENDPOINT: 'http://100.86.43.70:9100',
  SESSION_SECRET: 'x'.repeat(32),
}

describe('loadConfig', () => {
  it('reads endpoints and secret', () => {
    const c = loadConfig(good)
    expect(c.internalEndpoint).toBe('http://127.0.0.1:9100')
    expect(c.publicEndpoint).toBe('http://100.86.43.70:9100')
    expect(c.cookieName).toBe('mw_session')
  })

  it('throws when SESSION_SECRET is too short', () => {
    expect(() => loadConfig({ ...good, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/)
  })

  it('throws when an endpoint is missing', () => {
    expect(() => loadConfig({ ...good, MINIO_INTERNAL_ENDPOINT: undefined })).toThrow(/MINIO_INTERNAL_ENDPOINT/)
  })
})
