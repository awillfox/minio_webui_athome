import { describe, it, expect } from 'vitest'
import { prefixFromSegments, segmentsFromPrefix, breadcrumbs, displayName } from '@/lib/paths'

describe('paths', () => {
  it('builds a prefix from catch-all segments', () => {
    expect(prefixFromSegments(undefined)).toBe('')
    expect(prefixFromSegments([])).toBe('')
    expect(prefixFromSegments(['a', 'b'])).toBe('a/b/')
    expect(prefixFromSegments(['a b', 'c'])).toBe('a b/c/')
  })

  it('round-trips segments <-> prefix', () => {
    expect(segmentsFromPrefix('a/b/')).toEqual(['a', 'b'])
    expect(segmentsFromPrefix('')).toEqual([])
  })

  it('builds breadcrumbs', () => {
    expect(breadcrumbs('buck', 'a/b/')).toEqual([
      { label: 'buck', href: '/buckets/buck' },
      { label: 'a', href: '/buckets/buck/a' },
      { label: 'b', href: '/buckets/buck/a/b' },
    ])
  })

  it('derives a display name relative to the parent prefix', () => {
    expect(displayName('a/b/file.txt', 'a/b/')).toBe('file.txt')
    expect(displayName('a/b/sub/', 'a/b/')).toBe('sub')
  })
})
