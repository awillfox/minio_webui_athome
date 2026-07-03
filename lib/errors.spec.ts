import { describe, it, expect } from 'vitest'
import { toUserMessage, isAuthError } from '@/lib/errors'

describe('errors', () => {
  it('maps invalid key to a friendly message and flags auth error', () => {
    const err = { name: 'InvalidAccessKeyId', message: 'bad key' }
    expect(isAuthError(err)).toBe(true)
    expect(toUserMessage(err)).toMatch(/invalid credentials/i)
  })

  it('maps bad signature as auth error', () => {
    expect(isAuthError({ name: 'SignatureDoesNotMatch' })).toBe(true)
  })

  it('maps access denied as NOT an auth error', () => {
    const err = { name: 'AccessDenied', message: 'no' }
    expect(isAuthError(err)).toBe(false)
    expect(toUserMessage(err)).toMatch(/not permitted/i)
  })

  it('falls back to the error message', () => {
    expect(toUserMessage({ message: 'boom' })).toBe('boom')
    expect(toUserMessage('weird')).toMatch(/unexpected/i)
  })
})
