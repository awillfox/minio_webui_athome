import { requireSession } from '@/lib/session'
import { listPolicies } from '@/lib/admin/policies'
import { toUserMessage } from '@/lib/errors'
import { ViewPolicy, CreatePolicy } from './policies-client'

export default async function PoliciesPage() {
  const session = await requireSession()
  let policies: Awaited<ReturnType<typeof listPolicies>> = []
  let error: string | null = null
  try {
    policies = await listPolicies(session)
  } catch (err) {
    error = toUserMessage(err)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Policies</h1>
      <CreatePolicy />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {policies.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {policies.map((p) => (
            <li key={p.name} className="flex items-start justify-between gap-4 px-4 py-3">
              <div>
                <div className="font-medium text-zinc-900 dark:text-zinc-50">{p.name}</div>
                {p.builtin && <div className="text-xs text-zinc-500">built-in</div>}
              </div>
              <ViewPolicy name={p.name} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
