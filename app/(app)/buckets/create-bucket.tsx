'use client'

import { useActionState } from 'react'
import { createBucketAction } from './actions'

export function CreateBucket() {
  const [state, action, pending] = useActionState(createBucketAction, { error: null as string | null })
  return (
    <form action={action} className="flex items-center gap-2">
      <input name="name" placeholder="new-bucket-name"
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
      <button disabled={pending}
        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
        {pending ? 'Creating…' : 'Create bucket'}
      </button>
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
    </form>
  )
}
