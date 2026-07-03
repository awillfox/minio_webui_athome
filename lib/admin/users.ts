import { runMc, ALIAS } from '@/lib/mc'
import type { Creds } from '@/lib/session-crypto'
import { assertNotFlag } from './guard'

export type MinioUser = { accessKey: string; status: string }

export async function listUsers(session: Creds): Promise<MinioUser[]> {
  const lines = await runMc(session, ['admin', 'user', 'ls', ALIAS])
  return lines.map((l) => ({ accessKey: l.accessKey, status: l.userStatus ?? '' }))
}

export async function createUser(session: Creds, accessKey: string, secretKey: string): Promise<void> {
  assertNotFlag(accessKey, 'access key')
  assertNotFlag(secretKey, 'secret key')
  await runMc(session, ['admin', 'user', 'add', ALIAS, accessKey, secretKey])
}

export async function deleteUser(session: Creds, accessKey: string): Promise<void> {
  assertNotFlag(accessKey, 'access key')
  await runMc(session, ['admin', 'user', 'remove', ALIAS, accessKey])
}

export async function setUserStatus(session: Creds, accessKey: string, enabled: boolean): Promise<void> {
  assertNotFlag(accessKey, 'access key')
  await runMc(session, ['admin', 'user', enabled ? 'enable' : 'disable', ALIAS, accessKey])
}
