import Link from 'next/link'
import { requireSession } from '@/lib/session'
import { listObjects } from '@/lib/s3'
import { toUserMessage } from '@/lib/errors'
import { prefixFromSegments, breadcrumbs, displayName } from '@/lib/paths'
import { ObjectRow, UploadButton, NewFolder } from './browser-client'

export default async function ObjectBrowser({ params }: { params: Promise<{ bucket: string; prefix?: string[] }> }) {
  const { bucket, prefix: segs } = await params
  const prefix = prefixFromSegments(segs)
  const session = await requireSession()

  let data: Awaited<ReturnType<typeof listObjects>> | null = null
  let error: string | null = null
  try {
    data = await listObjects(session, bucket, prefix)
  } catch (err) {
    error = toUserMessage(err)
  }

  const crumbs = breadcrumbs(bucket, prefix)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex flex-wrap items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
          {crumbs.map((c, i) => (
            <span key={c.href} className="flex items-center gap-1">
              {i > 0 && <span>/</span>}
              <Link href={c.href} className="hover:underline">{c.label}</Link>
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <NewFolder bucket={bucket} prefix={prefix} />
          <UploadButton bucket={bucket} prefix={prefix} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {data?.folders.map((f) => (
          <li key={f} className="px-4 py-3">
            <Link href={`/buckets/${encodeURIComponent(bucket)}/${f.replace(/\/$/, '').split('/').map(encodeURIComponent).join('/')}`}
              className="font-medium text-zinc-900 hover:underline dark:text-zinc-50">
              📁 {displayName(f, prefix)}
            </Link>
          </li>
        ))}
        {data?.objects.map((o) => (
          <ObjectRow key={o.key} bucket={bucket} prefix={prefix} obj={o} />
        ))}
        {data && data.folders.length === 0 && data.objects.length === 0 && (
          <li className="px-4 py-6 text-sm text-zinc-500">This folder is empty.</li>
        )}
      </ul>
    </div>
  )
}
