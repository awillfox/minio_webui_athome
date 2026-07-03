'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { displayName } from '@/lib/paths'
import { downloadUrlAction, uploadUrlAction } from './actions'

export function UploadButton({ bucket, prefix }: { bucket: string; prefix: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const url = await uploadUrlAction(bucket, prefix, file.name, file.type || 'application/octet-stream')
      const res = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } })
      if (!res.ok) throw new Error(`Upload failed (${res.status})`)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" hidden onChange={onPick} />
      <button disabled={busy} onClick={() => inputRef.current?.click()}
        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
        {busy ? 'Uploading…' : 'Upload file'}
      </button>
    </>
  )
}

type Obj = { key: string; size: number }

export function ObjectRow({ bucket, prefix, obj }: { bucket: string; prefix: string; obj: Obj }) {
  async function download() {
    const url = await downloadUrlAction(bucket, obj.key)
    window.location.href = url
  }
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <span className="text-zinc-800 dark:text-zinc-200">📄 {displayName(obj.key, prefix)}</span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500">{obj.size} B</span>
        <button onClick={download} className="text-sm text-blue-600 hover:underline">Download</button>
      </div>
    </li>
  )
}
