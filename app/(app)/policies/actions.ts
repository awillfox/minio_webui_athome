'use server'

import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/session'
import { getPolicy, createPolicy } from '@/lib/admin/policies'
import { toUserMessage } from '@/lib/errors'

export async function viewPolicyAction(name: string): Promise<{ document?: string; error: string | null }> {
  try {
    const doc = await getPolicy(await requireSession(), name)
    return { document: JSON.stringify(doc, null, 2), error: null }
  } catch (err) {
    return { error: toUserMessage(err) }
  }
}

export async function createPolicyAction(_prev: { error: string | null }, formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const document = String(formData.get('document') ?? '').trim()
  if (!name || !document) return { error: 'Enter a name and a policy document' }
  try {
    JSON.parse(document) // validate JSON before shelling out
  } catch {
    return { error: 'Policy document is not valid JSON' }
  }
  try {
    await createPolicy(await requireSession(), name, document)
    revalidatePath('/policies')
    return { error: null }
  } catch (err) {
    return { error: toUserMessage(err) }
  }
}
