'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { createUserAction, deleteUserAction, setStatusAction, attachPolicyAction } from './actions'

export function CreateUser() {
  const [state, action, pending] = useActionState(createUserAction, { error: null as string | null })
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input name="accessKey" placeholder="username / access key"
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
      <input name="secretKey" type="password" placeholder="secret key"
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
      <button disabled={pending}
        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
        {pending ? 'Creating…' : 'Create user'}
      </button>
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
    </form>
  )
}

export function UserRow({ accessKey, status, policies }: { accessKey: string; status: string; policies: string[] }) {
  const router = useRouter()
  const enabled = status === 'enabled'
  async function toggle() {
    const r = await setStatusAction(accessKey, !enabled)
    if (r.error) alert(r.error); else router.refresh()
  }
  async function del() {
    if (!confirm(`Delete user ${accessKey}?`)) return
    const r = await deleteUserAction(accessKey)
    if (r.error) alert(r.error); else router.refresh()
  }
  async function attach(policy: string) {
    if (!policy) return
    const r = await attachPolicyAction(accessKey, policy)
    if (r.error) alert(r.error); else router.refresh()
  }
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <div>
        <div className="font-medium text-zinc-900 dark:text-zinc-50">{accessKey}</div>
        <div className="text-xs text-zinc-500">{status}</div>
      </div>
      <div className="flex items-center gap-3">
        <select defaultValue="" onChange={(e) => attach(e.target.value)}
          className="rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800">
          <option value="" disabled>Attach policy…</option>
          {policies.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={toggle} className="text-sm text-blue-600 hover:underline">{enabled ? 'Disable' : 'Enable'}</button>
        <button onClick={del} className="text-sm text-red-600 hover:underline">Delete</button>
      </div>
    </li>
  )
}
