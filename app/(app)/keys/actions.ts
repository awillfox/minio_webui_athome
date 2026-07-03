'use server'

import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/session'
import { createAccessKey, deleteAccessKey } from '@/lib/admin/keys'
import { toUserMessage } from '@/lib/errors'

export async function createKeyAction(): Promise<{ accessKey?: string; secretKey?: string; error: string | null }> {
  try {
    const created = await createAccessKey(await requireSession())
    revalidatePath('/keys')
    return { ...created, error: null }
  } catch (err) {
    return { error: toUserMessage(err) }
  }
}

export async function deleteKeyAction(accessKey: string): Promise<{ error: string | null }> {
  if (!accessKey) return { error: 'Missing access key' }
  try {
    await deleteAccessKey(await requireSession(), accessKey)
    revalidatePath('/keys')
    return { error: null }
  } catch (err) {
    return { error: toUserMessage(err) }
  }
}
