'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { viewPolicyAction, createPolicyAction } from './actions'

export function ViewPolicy({ name }: { name: string }) {
  const [doc, setDoc] = useState<string | null>(null)
  async function view() {
    const r = await viewPolicyAction(name)
    if (r.error) { alert(r.error); return }
    setDoc(r.document ?? '')
  }
  return (
    <div>
      <button onClick={doc ? () => setDoc(null) : view} className="text-sm text-blue-600 hover:underline">
        {doc ? 'Hide' : 'View'}
      </button>
      {doc && (
        <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-zinc-100 p-3 text-xs dark:bg-zinc-900">{doc}</pre>
      )}
    </div>
  )
}

export function CreatePolicy() {
  const router = useRouter()
  const [state, action, pending] = useActionState(async (prev: { error: string | null }, fd: FormData) => {
    const r = await createPolicyAction(prev, fd)
    if (!r.error) router.refresh()
    return r
  }, { error: null as string | null })
  return (
    <form action={action} className="space-y-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <input name="name" placeholder="policy-name"
        className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
      <textarea name="document" rows={8} placeholder='{"Version":"2012-10-17","Statement":[…]}'
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800" />
      <div className="flex items-center gap-3">
        <button disabled={pending}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
          {pending ? 'Creating…' : 'Create policy'}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  )
}
