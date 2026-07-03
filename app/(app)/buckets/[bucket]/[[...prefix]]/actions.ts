'use server'

import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/session'
import { presignGet, presignPut, deleteObject, putEmptyFolder } from '@/lib/s3'
import { toUserMessage } from '@/lib/errors'
import { segmentsFromPrefix } from '@/lib/paths'

function browsePath(bucket: string, prefix: string) {
  const segs = segmentsFromPrefix(prefix).map(encodeURIComponent)
  return `/buckets/${encodeURIComponent(bucket)}${segs.length ? '/' + segs.join('/') : ''}`
}

export async function downloadUrlAction(bucket: string, key: string): Promise<string> {
  return presignGet(await requireSession(), bucket, key)
}

export async function uploadUrlAction(bucket: string, prefix: string, filename: string, contentType: string): Promise<string> {
  const key = prefix + filename
  return presignPut(await requireSession(), bucket, key, contentType)
}

export async function deleteObjectAction(bucket: string, key: string, prefix: string): Promise<{ error: string | null }> {
  try {
    await deleteObject(await requireSession(), bucket, key)
  } catch (err) {
    return { error: toUserMessage(err) }
  }
  revalidatePath(browsePath(bucket, prefix))
  return { error: null }
}

export async function newFolderAction(bucket: string, prefix: string, name: string): Promise<{ error: string | null }> {
  const clean = name.trim()
  if (!clean) return { error: 'Enter a folder name' }
  try {
    await putEmptyFolder(await requireSession(), bucket, prefix, clean)
  } catch (err) {
    return { error: toUserMessage(err) }
  }
  revalidatePath(browsePath(bucket, prefix))
  return { error: null }
}
