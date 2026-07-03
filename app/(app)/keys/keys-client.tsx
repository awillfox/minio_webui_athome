'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createKeyAction, deleteKeyAction } from './actions'

export function CreateKey() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ accessKey: string; secretKey: string } | null>(null)

  async function create() {
    setBusy(true)
    const r = await createKeyAction()
    setBusy(false)
    if (r.error) { alert(r.error); return }
    setCreated({ accessKey: r.accessKey!, secretKey: r.secretKey! })
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <button onClick={create} disabled={busy}
        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
        {busy ? 'Creating…' : 'Create access key'}
      </button>
      {created && (
        <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
          <p className="font-medium text-amber-900 dark:text-amber-200">Save this secret now — it won&apos;t be shown again.</p>
          <p className="mt-1 font-mono break-all">Access key: {created.accessKey}</p>
          <p className="font-mono break-all">Secret key: {created.secretKey}</p>
          <button onClick={() => setCreated(null)} className="mt-2 text-xs text-amber-800 underline dark:text-amber-300">Dismiss</button>
        </div>
      )}
    </div>
  )
}

export function DeleteKey({ accessKey }: { accessKey: string }) {
  const router = useRouter()
  async function del() {
    if (!confirm(`Delete access key ${accessKey}?`)) return
    const r = await deleteKeyAction(accessKey)
    if (r.error) alert(r.error)
    else router.refresh()
  }
  return <button onClick={del} className="text-sm text-red-600 hover:underline">Delete</button>
}
