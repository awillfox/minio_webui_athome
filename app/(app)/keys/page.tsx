import { requireSession } from '@/lib/session'
import { listAccessKeys } from '@/lib/admin/keys'
import { toUserMessage } from '@/lib/errors'
import { CreateKey, DeleteKey } from './keys-client'

export default async function KeysPage() {
  const session = await requireSession()
  let keys: Awaited<ReturnType<typeof listAccessKeys>> = []
  let error: string | null = null
  try {
    keys = await listAccessKeys(session)
  } catch (err) {
    error = toUserMessage(err)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Access Keys</h1>
      </div>
      <CreateKey />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && keys.length === 0 && <p className="text-sm text-zinc-500">No access keys yet.</p>}
      {keys.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {keys.map((k) => (
            <li key={k.accessKey} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="font-mono text-sm text-zinc-900 dark:text-zinc-50">{k.accessKey}</div>
                <div className="text-xs text-zinc-500">{k.parentUser} · {k.status}</div>
              </div>
              <DeleteKey accessKey={k.accessKey} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
