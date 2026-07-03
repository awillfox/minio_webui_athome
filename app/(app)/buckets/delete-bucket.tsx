'use client'

import { useRouter } from 'next/navigation'
import { deleteBucketAction } from './actions'

export function DeleteBucket({ name }: { name: string }) {
  const router = useRouter()
  async function del() {
    if (!confirm(`Delete bucket "${name}"? This cannot be undone.`)) return
    const r = await deleteBucketAction(name)
    if (r.error) alert(r.error); else router.refresh()
  }
  return (
    <button onClick={del} className="text-sm text-red-600 hover:underline">Delete</button>
  )
}
