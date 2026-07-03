import Link from 'next/link'
import { requireSession } from '@/lib/session'
import { listBuckets } from '@/lib/s3'
import { toUserMessage } from '@/lib/errors'
import { CreateBucket } from './create-bucket'
import { DeleteBucket } from './delete-bucket'

export default async function BucketsPage() {
  const session = await requireSession()
  let buckets: { name: string; creationDate?: Date }[] = []
  let error: string | null = null
  try {
    buckets = await listBuckets(session)
  } catch (err) {
    error = toUserMessage(err)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Buckets</h1>
        <CreateBucket />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && buckets.length === 0 && <p className="text-sm text-zinc-500">No buckets yet.</p>}
      {buckets.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {buckets.map((b) => (
            <li key={b.name} className="flex items-center justify-between px-4 py-3">
              <Link href={`/buckets/${encodeURIComponent(b.name)}`} className="font-medium text-zinc-900 hover:underline dark:text-zinc-50">
                {b.name}
              </Link>
              <DeleteBucket name={b.name} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
