import { describe, it, expect } from 'vitest'
import { mcHost, parseMcLines } from '@/lib/mc'

const creds = { accessKey: 'AKIA', secretKey: 's3c/ret+with=specials' }

describe('mcHost', () => {
  it('injects url-encoded creds into the endpoint host', () => {
    expect(mcHost('http://127.0.0.1:9100', creds)).toBe(
      'http://AKIA:s3c%2Fret%2Bwith%3Dspecials@127.0.0.1:9100'
    )
  })
  it('preserves the scheme and host for a remote endpoint', () => {
    expect(mcHost('http://100.86.43.70:9100', { accessKey: 'a', secretKey: 'b' })).toBe(
      'http://a:b@100.86.43.70:9100'
    )
  })
})

describe('parseMcLines', () => {
  it('parses one object per line, ignoring blanks', () => {
    const out = '{"status":"success","policy":"readonly"}\n\n{"status":"success","policy":"readwrite"}\n'
    expect(parseMcLines(out)).toEqual([
      { status: 'success', policy: 'readonly' },
      { status: 'success', policy: 'readwrite' },
    ])
  })
  it('throws the mc error message when a line is an error', () => {
    const out = '{"status":"error","error":{"message":"The specified user does not exist"}}'
    expect(() => parseMcLines(out)).toThrow(/does not exist/)
  })
  it('returns [] for empty output', () => {
    expect(parseMcLines('')).toEqual([])
  })
})
