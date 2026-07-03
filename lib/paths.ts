export function prefixFromSegments(segments?: string[]): string {
  if (!segments || segments.length === 0) return ''
  return segments.join('/') + '/'
}

export function segmentsFromPrefix(prefix: string): string[] {
  return prefix.replace(/\/+$/, '').split('/').filter(Boolean)
}

export function breadcrumbs(bucket: string, prefix: string) {
  const segs = segmentsFromPrefix(prefix)
  const crumbs = [{ label: bucket, href: `/buckets/${encodeURIComponent(bucket)}` }]
  let acc = `/buckets/${encodeURIComponent(bucket)}`
  for (const s of segs) {
    acc += `/${encodeURIComponent(s)}`
    crumbs.push({ label: s, href: acc })
  }
  return crumbs
}

export function displayName(keyOrPrefix: string, parentPrefix: string): string {
  const rest = keyOrPrefix.startsWith(parentPrefix) ? keyOrPrefix.slice(parentPrefix.length) : keyOrPrefix
  return rest.replace(/\/+$/, '')
}
