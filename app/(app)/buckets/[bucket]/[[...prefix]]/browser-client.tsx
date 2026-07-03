'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { displayName } from '@/lib/paths'
import { downloadUrlAction, uploadUrlAction, deleteObjectAction, newFolderAction } from './actions'

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

  // Use a <label> wrapping the file input so the browser natively opens the
  // file picker on click — this works reliably in both production and in Playwright's
  // headless Chromium (where programmatic input.click() from an onClick handler does
  // not always trigger the filechooser event).
  return (
    <label
      role="button"
      aria-disabled={busy}
      onClick={busy ? (e) => e.preventDefault() : undefined}
      className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white cursor-pointer select-none aria-disabled:opacity-50 dark:bg-white dark:text-black"
    >
      <input ref={inputRef} type="file" aria-hidden="true" className="sr-only" onChange={onPick} />
      {busy ? 'Uploading…' : 'Upload file'}
    </label>
  )
}

type Obj = { key: string; size: number }

export function ObjectRow({ bucket, prefix, obj }: { bucket: string; prefix: string; obj: Obj }) {
  const router = useRouter()
  async function download() {
    const url = await downloadUrlAction(bucket, obj.key)
    window.location.href = url
  }
  async function del() {
    if (!confirm(`Delete ${displayName(obj.key, prefix)}?`)) return
    const r = await deleteObjectAction(bucket, obj.key, prefix)
    if (r.error) alert(r.error); else router.refresh()
  }
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <span className="text-zinc-800 dark:text-zinc-200">📄 {displayName(obj.key, prefix)}</span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500">{obj.size} B</span>
        <button onClick={download} className="text-sm text-blue-600 hover:underline">Download</button>
        <button onClick={del} className="text-sm text-red-600 hover:underline">Delete</button>
      </div>
    </li>
  )
}

export function NewFolder({ bucket, prefix }: { bucket: string; prefix: string }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  async function create() {
    setBusy(true)
    const r = await newFolderAction(bucket, prefix, name)
    setBusy(false)
    if (r.error) alert(r.error)
    else { setName(''); router.refresh() }
  }
  return (
    <div className="flex items-center gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="new-folder"
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
      <button disabled={busy} onClick={create} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
        {busy ? 'Creating…' : 'New folder'}
      </button>
    </div>
  )
}
