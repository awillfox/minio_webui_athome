import { describe, it, expect } from 'vitest'
import { encryptSession, decryptSession } from '@/lib/session-crypto'

const secret = 'test-secret-that-is-at-least-32-characters-long'
const creds = { accessKey: 'AKIA', secretKey: 's3cr3t/value+with=chars' }

describe('session-crypto', () => {
  it('round-trips creds', () => {
    const token = encryptSession(creds, secret)
    expect(token).not.toContain('s3cr3t')
    expect(decryptSession(token, secret)).toEqual(creds)
  })

  it('returns null on a tampered token', () => {
    const token = encryptSession(creds, secret)
    const tampered = token.slice(0, -2) + (token.endsWith('A') ? 'BB' : 'AA')
    expect(decryptSession(tampered, secret)).toBeNull()
  })

  it('returns null under a different secret', () => {
    const token = encryptSession(creds, secret)
    expect(decryptSession(token, 'another-secret-of-at-least-32-characters!!')).toBeNull()
  })

  it('returns null on garbage', () => {
    expect(decryptSession('not-a-token', secret)).toBeNull()
  })
})
