'use client'

import { displayName } from '@/lib/paths'
import { downloadUrlAction } from './actions'

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
