'use client'

import { useActionState } from 'react'
import { login, type LoginState } from './actions'

const initial: LoginState = { error: null }

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, initial)
  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <form action={action} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-sm dark:bg-zinc-900">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">MinIO Console</h1>
        <label className="block space-y-1">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Access Key</span>
          <input name="accessKey" autoComplete="username" required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Secret Key</span>
          <input name="secretKey" type="password" autoComplete="current-password" required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800" />
        </label>
        {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
        <button type="submit" disabled={pending}
          className="w-full rounded-lg bg-zinc-900 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
