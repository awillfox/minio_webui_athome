'use server'

import { requireSession } from '@/lib/session'
import { presignGet, presignPut } from '@/lib/s3'

export async function downloadUrlAction(bucket: string, key: string): Promise<string> {
  return presignGet(await requireSession(), bucket, key)
}

export async function uploadUrlAction(bucket: string, prefix: string, filename: string, contentType: string): Promise<string> {
  const key = prefix + filename
  return presignPut(await requireSession(), bucket, key, contentType)
}
