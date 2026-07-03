import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { config } from '@/lib/config'
import { encryptSession, decryptSession, type Creds } from '@/lib/session-crypto'

export type { Creds }

export async function getSession(): Promise<Creds | null> {
  const store = await cookies()
  const token = store.get(config.cookieName)?.value
  if (!token) return null
  return decryptSession(token, config.sessionSecret)
}

export async function requireSession(): Promise<Creds> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

export async function setSessionCookie(creds: Creds): Promise<void> {
  const store = await cookies()
  store.set(config.cookieName, encryptSession(creds, config.sessionSecret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: config.cookieMaxAge,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(config.cookieName)
}
