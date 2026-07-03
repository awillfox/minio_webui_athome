import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runMc, ALIAS } from '@/lib/mc'
import type { Creds } from '@/lib/session-crypto'
import { assertNotFlag } from './guard'

export type Policy = { name: string; builtin: boolean }

const BUILTINS = new Set(['consoleAdmin', 'diagnostics', 'readonly', 'readwrite', 'writeonly'])

export async function listPolicies(session: Creds): Promise<Policy[]> {
  const lines = await runMc(session, ['admin', 'policy', 'ls', ALIAS])
  return lines.map((l) => ({ name: l.policy, builtin: BUILTINS.has(l.policy) }))
}

export async function getPolicy(session: Creds, name: string): Promise<unknown> {
  assertNotFlag(name, 'policy name')
  const [res] = await runMc(session, ['admin', 'policy', 'info', ALIAS, name])
  return res?.policyInfo?.Policy ?? null
}

export async function createPolicy(session: Creds, name: string, document: string): Promise<void> {
  assertNotFlag(name, 'policy name')
  // mc admin policy create needs the document in a file. Use a unique temp file per call
  // (randomUUID, not pid — all concurrent requests share one Node process).
  const file = join(tmpdir(), `mw-policy-${randomUUID()}.json`)
  await writeFile(file, document, 'utf8')
  try {
    await runMc(session, ['admin', 'policy', 'create', ALIAS, name, file])
  } finally {
    await unlink(file).catch(() => {})
  }
}

export async function attachPolicy(session: Creds, user: string, policy: string): Promise<void> {
  assertNotFlag(policy, 'policy name')
  await runMc(session, ['admin', 'policy', 'attach', ALIAS, '--user', user, policy])
}

export async function detachPolicy(session: Creds, user: string, policy: string): Promise<void> {
  assertNotFlag(policy, 'policy name')
  await runMc(session, ['admin', 'policy', 'detach', ALIAS, '--user', user, policy])
}
