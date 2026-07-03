import { requireSession } from '@/lib/session'
import { listUsers } from '@/lib/admin/users'
import { listPolicies } from '@/lib/admin/policies'
import { toUserMessage } from '@/lib/errors'
import { CreateUser, UserRow } from './users-client'

export default async function UsersPage() {
  const session = await requireSession()
  let users: Awaited<ReturnType<typeof listUsers>> = []
  let policies: string[] = []
  let error: string | null = null
  try {
    users = await listUsers(session)
    policies = (await listPolicies(session)).map((p) => p.name)
  } catch (err) {
    error = toUserMessage(err)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Users</h1>
        <CreateUser />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && users.length === 0 && <p className="text-sm text-zinc-500">No users yet.</p>}
      {users.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {users.map((u) => <UserRow key={u.accessKey} accessKey={u.accessKey} status={u.status} policies={policies} />)}
        </ul>
      )}
    </div>
  )
}
