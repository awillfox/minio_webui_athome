import { runMc, ALIAS } from '@/lib/mc'
import type { Creds } from '@/lib/session-crypto'

export type AccessKey = { accessKey: string; parentUser: string; status: string; expiration: string }

export async function listAccessKeys(session: Creds): Promise<AccessKey[]> {
  const lines = await runMc(session, ['admin', 'accesskey', 'list', ALIAS])
  const keys: AccessKey[] = []
  for (const line of lines) {
    for (const s of line.svcaccs ?? []) {
      keys.push({
        accessKey: s.accessKey,
        parentUser: s.parentUser || line.user || '',
        status: s.accountStatus || 'on',
        expiration: s.expiration ?? '',
      })
    }
  }
  return keys
}

export async function createAccessKey(session: Creds): Promise<{ accessKey: string; secretKey: string }> {
  const [res] = await runMc(session, ['admin', 'accesskey', 'create', ALIAS])
  return { accessKey: res.accessKey, secretKey: res.secretKey }
}

export async function deleteAccessKey(session: Creds, accessKey: string): Promise<void> {
  await runMc(session, ['admin', 'accesskey', 'rm', ALIAS, accessKey])
}
