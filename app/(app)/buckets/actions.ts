'use server'

import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/session'
import { createBucket, deleteBucket } from '@/lib/s3'
import { toUserMessage } from '@/lib/errors'

export async function createBucketAction(_prev: { error: string | null }, formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Enter a bucket name' }
  try {
    await createBucket(await requireSession(), name)
  } catch (err) {
    return { error: toUserMessage(err) }
  }
  revalidatePath('/buckets')
  return { error: null }
}

export async function deleteBucketAction(name: string): Promise<{ error: string | null }> {
  if (!name) return { error: 'Missing bucket name' }
  try {
    await deleteBucket(await requireSession(), name)
  } catch (err) {
    return { error: toUserMessage(err) }
  }
  revalidatePath('/buckets')
  return { error: null }
}
