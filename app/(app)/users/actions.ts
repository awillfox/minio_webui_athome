'use server'

import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/session'
import { createUser, deleteUser, setUserStatus } from '@/lib/admin/users'
import { attachPolicy } from '@/lib/admin/policies'
import { toUserMessage } from '@/lib/errors'

export async function createUserAction(_prev: { error: string | null }, formData: FormData) {
  const accessKey = String(formData.get('accessKey') ?? '').trim()
  const secretKey = String(formData.get('secretKey') ?? '')
  if (!accessKey || !secretKey) return { error: 'Enter an access key and secret key' }
  try {
    await createUser(await requireSession(), accessKey, secretKey)
    revalidatePath('/users')
    return { error: null }
  } catch (err) {
    return { error: toUserMessage(err) }
  }
}

export async function deleteUserAction(accessKey: string): Promise<{ error: string | null }> {
  if (!accessKey) return { error: 'Missing user' }
  try {
    await deleteUser(await requireSession(), accessKey)
    revalidatePath('/users')
    return { error: null }
  } catch (err) {
    return { error: toUserMessage(err) }
  }
}

export async function setStatusAction(accessKey: string, enabled: boolean): Promise<{ error: string | null }> {
  try {
    await setUserStatus(await requireSession(), accessKey, enabled)
    revalidatePath('/users')
    return { error: null }
  } catch (err) {
    return { error: toUserMessage(err) }
  }
}

export async function attachPolicyAction(accessKey: string, policy: string): Promise<{ error: string | null }> {
  if (!policy) return { error: 'Choose a policy' }
  try {
    await attachPolicy(await requireSession(), accessKey, policy)
    revalidatePath('/users')
    return { error: null }
  } catch (err) {
    return { error: toUserMessage(err) }
  }
}
