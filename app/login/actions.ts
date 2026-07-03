'use server'

import { redirect } from 'next/navigation'
import { validateCredentials } from '@/lib/s3'
import { setSessionCookie } from '@/lib/session'

export type LoginState = { error: string | null }

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const accessKey = String(formData.get('accessKey') ?? '').trim()
  const secretKey = String(formData.get('secretKey') ?? '')
  if (!accessKey || !secretKey) return { error: 'Enter both an access key and a secret key' }

  const ok = await validateCredentials({ accessKey, secretKey })
  if (!ok) return { error: 'Invalid credentials' }

  await setSessionCookie({ accessKey, secretKey })
  redirect('/buckets')
}
