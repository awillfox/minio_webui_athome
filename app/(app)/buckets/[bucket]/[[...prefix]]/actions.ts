'use server'

import { requireSession } from '@/lib/session'
import { presignGet } from '@/lib/s3'

export async function downloadUrlAction(bucket: string, key: string): Promise<string> {
  return presignGet(await requireSession(), bucket, key)
}
