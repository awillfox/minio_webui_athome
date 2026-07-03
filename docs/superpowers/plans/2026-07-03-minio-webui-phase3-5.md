# MinIO Web Console — Phase 3–5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the admin half of the console — access keys, users, policies, and a metrics dashboard — by driving the `mc` client as a subprocess, replacing the four stub pages.

**Architecture:** The hybrid design's admin half. A single `lib/mc.ts` spawns `mc` with a per-session `MC_HOST_mw` env var (credentials from the logged-in session, no persisted alias/config), passes `--json`, and parses the JSON-lines output. Typed wrappers in `lib/admin/*` expose each feature. Pages are Server Components reading via those wrappers; mutations are Server Actions that guard with `requireSession()`. This avoids reimplementing MinIO's admin-API SigV4 + DARE response encryption in JS.

**Tech Stack:** Next.js 16.2.10, React 19, Tailwind v4, Node `child_process` (`execFile`), the `mc` client (MinIO Client), vitest, Playwright.

## Global Constraints

- **`mc` must be on `PATH`** at runtime. On the deploy host (coffee-server) it is at `/usr/local/bin/mc`. On the dev machine it is NOT installed — Task 1 installs it.
- **Per-session `mc` auth via env, never a config file or persisted alias.** For each spawn set `MC_HOST_mw=http://<urlenc-accessKey>:<urlenc-secretKey>@<host:port>` where the host is from `config.internalEndpoint` (`127.0.0.1:9100` in prod, `100.86.43.70:9100` in dev via `.env.local`). The alias name is always `mw`.
- **No shell.** Use `execFile('mc', args, {env})` — arguments as an argv array, never string-interpolated, to prevent injection. User input (usernames, key names, policy names) is passed as separate argv entries.
- **Capture stdout even on non-zero exit.** `mc` prints an error object (`{"status":"error","error":{"message":...}}`) to stdout and exits non-zero. `runMc` must read stdout regardless of exit code and surface `error.message`.
- **MinIO admin JSON shapes** (verified against the live server, `mc RELEASE.2025-08-13`, MinIO `RELEASE.2025-09-07`):
  - `mc admin info mw --json` → `{status,info:{mode,buckets:{count},objects:{count},usage:{size},backend:{onlineDisks,offlineDisks},servers:[{state,endpoint,uptime,version,drives:[{state,path,totalspace,usedspace,availspace}]}]}}`
  - `mc admin user ls mw --json` → one line per user: `{status,accessKey,userStatus}`
  - `mc admin user add mw <ak> <sk> --json` → `{status,accessKey,secretKey,userStatus}`
  - `mc admin user info mw <user> --json` → `{status,accessKey,userStatus,policyName?,memberOf?}`
  - `mc admin user enable|disable|remove mw <user> --json` → `{status,accessKey,...}`
  - `mc admin policy ls mw --json` → one line per policy: `{status,policy,isGroup}`
  - `mc admin policy info mw <name> --json` → `{status,policy,policyInfo:{PolicyName,Policy:{Version,Statement}}}`
  - `mc admin policy attach|detach mw <policy> --user <user> --json` → `{status,policiesAttached|policiesDetached:[...],user}`
  - `mc admin policy create mw <name> <file.json> --json` → `{status}` (needs a temp file holding the policy JSON)
  - `mc admin accesskey list mw --json` → one line per user: `{status,user,stsKeys,svcaccs:[{accessKey,accountStatus,expiration,parentUser}]|null}`
  - `mc admin accesskey create mw --json` → `{status,accessKey,secretKey,expiration}` (creates for the logged-in identity; secret shown ONCE)
  - `mc admin accesskey rm mw <accessKey> --json` → `{status,accessKey}`
- **Auth:** every Server Action calls `requireSession()`; every page is under the `(app)` layout guard. MinIO RBAC governs what each logged-in identity can do (a non-admin gets an `mc` error surfaced as a message).
- **e2e** runs against live MinIO on coffee-server; gated on `MW_TEST_ACCESS_KEY`/`MW_TEST_SECRET_KEY`; self-cleaning. Reuse the existing `e2e/buckets.spec.ts` `loginUI` pattern (or a shared helper).
- **TDD** for the pure logic in `lib/mc.ts` (host construction, JSON-lines parsing, error surfacing). `mc`-touching wrappers and pages are validated by e2e.
- Money/domain rules: none.

## File Structure

- `lib/mc.ts` — `mcHost` (pure), `parseMcLines` (pure), `runMc(session,args)` (spawn) + `ALIAS`
- `lib/admin/keys.ts` — `listAccessKeys`, `createAccessKey`, `deleteAccessKey`
- `lib/admin/users.ts` — `listUsers`, `createUser`, `deleteUser`, `setUserStatus`
- `lib/admin/policies.ts` — `listPolicies`, `getPolicy`, `createPolicy`, `attachPolicy`, `detachPolicy`
- `lib/admin/info.ts` — `getServerInfo`
- `app/(app)/keys/{page.tsx,actions.ts,keys-client.tsx}` (replaces stub)
- `app/(app)/users/{page.tsx,actions.ts,users-client.tsx}` (replaces stub)
- `app/(app)/policies/{page.tsx,actions.ts,policies-client.tsx}` (replaces stub)
- `app/(app)/metrics/page.tsx` (replaces stub)
- `e2e/admin.spec.ts` — access-key + user lifecycle e2e

---

## Task 1: `lib/mc.ts` — mc subprocess driver + install mc on dev

**Files:**
- Create: `lib/mc.ts`
- Test: `lib/mc.spec.ts`

**Interfaces:**
- Produces:
  - `const ALIAS = 'mw'`
  - `mcHost(endpoint: string, creds: Creds): string` — build `http://<enc-ak>:<enc-sk>@host:port` from an endpoint URL
  - `parseMcLines(out: string): any[]` — split JSON lines, `JSON.parse` each, throw `Error(error.message)` if any line has `status === 'error'`
  - `runMc(session: Creds, args: string[]): Promise<any[]>` — spawn `mc [...args] --json` with the `MC_HOST_mw` env, return `parseMcLines(stdout)`

- [ ] **Step 1: Install `mc` on the dev machine**

Run:
```bash
curl -fsSL -o /tmp/mc https://dl.min.io/client/mc/release/linux-amd64/mc && chmod +x /tmp/mc && sudo mv /tmp/mc /usr/local/bin/mc && mc --version | head -1
```
Expected: prints an `mc version RELEASE...` line and `mc` is on PATH. (Prod host already has it.)

- [ ] **Step 2: Write the failing test — `lib/mc.spec.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { mcHost, parseMcLines } from '@/lib/mc'

const creds = { accessKey: 'AKIA', secretKey: 's3c/ret+with=specials' }

describe('mcHost', () => {
  it('injects url-encoded creds into the endpoint host', () => {
    expect(mcHost('http://127.0.0.1:9100', creds)).toBe(
      'http://AKIA:s3c%2Fret%2Bwith%3Dspecials@127.0.0.1:9100'
    )
  })
  it('preserves the scheme and host for a remote endpoint', () => {
    expect(mcHost('http://100.86.43.70:9100', { accessKey: 'a', secretKey: 'b' })).toBe(
      'http://a:b@100.86.43.70:9100'
    )
  })
})

describe('parseMcLines', () => {
  it('parses one object per line, ignoring blanks', () => {
    const out = '{"status":"success","policy":"readonly"}\n\n{"status":"success","policy":"readwrite"}\n'
    expect(parseMcLines(out)).toEqual([
      { status: 'success', policy: 'readonly' },
      { status: 'success', policy: 'readwrite' },
    ])
  })
  it('throws the mc error message when a line is an error', () => {
    const out = '{"status":"error","error":{"message":"The specified user does not exist"}}'
    expect(() => parseMcLines(out)).toThrow(/does not exist/)
  })
  it('returns [] for empty output', () => {
    expect(parseMcLines('')).toEqual([])
  })
})
```

- [ ] **Step 3: Run test — verify it fails**

Run: `npm test -- lib/mc.spec.ts`
Expected: FAIL (module missing).

- [ ] **Step 4: Implement `lib/mc.ts`**

```ts
import { execFile } from 'node:child_process'
import { config } from '@/lib/config'
import type { Creds } from '@/lib/session-crypto'

export const ALIAS = 'mw'

export function mcHost(endpoint: string, creds: Creds): string {
  const u = new URL(endpoint)
  const auth = `${encodeURIComponent(creds.accessKey)}:${encodeURIComponent(creds.secretKey)}`
  return `${u.protocol}//${auth}@${u.host}`
}

export function parseMcLines(out: string): any[] {
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean)
  const parsed = lines.map((l) => JSON.parse(l))
  const err = parsed.find((p) => p?.status === 'error')
  if (err) {
    const message = err.error?.message || err.error?.cause || 'mc command failed'
    throw new Error(message)
  }
  return parsed
}

export async function runMc(session: Creds, args: string[]): Promise<any[]> {
  const env = { ...process.env, [`MC_HOST_${ALIAS}`]: mcHost(config.internalEndpoint, session) }
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile('mc', [...args, '--json'], { env, maxBuffer: 8 * 1024 * 1024 }, (error, out, stderr) => {
      // mc prints its error object to stdout and exits non-zero; prefer stdout,
      // fall back to stderr, and only reject if we got nothing to parse.
      if (out && out.trim()) return resolve(out)
      if (error && (!stderr || !stderr.trim())) return reject(error)
      return resolve(stderr || '')
    })
  })
  return parseMcLines(stdout)
}
```

- [ ] **Step 5: Run test — verify it passes**

Run: `npm test -- lib/mc.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Smoke `runMc` against live MinIO (manual, not committed)**

With `.env.local` pointing at `http://100.86.43.70:9100`, run a one-off node check (or defer to Task 2's e2e). Optional; the e2e in later tasks is the real integration test.

- [ ] **Step 7: Commit**

```bash
git add lib/mc.ts lib/mc.spec.ts
git commit -m "feat: mc subprocess driver (per-session MC_HOST env, JSON-lines parsing)"
```

---

## Task 2: Access Keys page

**Files:**
- Create: `lib/admin/keys.ts`
- Create: `app/(app)/keys/actions.ts`, `app/(app)/keys/keys-client.tsx`
- Modify: `app/(app)/keys/page.tsx` (replace stub)
- Create: `e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `runMc`, `ALIAS`, `requireSession`, `toUserMessage`
- Produces (`lib/admin/keys.ts`):
  - `type AccessKey = { accessKey: string; parentUser: string; status: string; expiration: string }`
  - `listAccessKeys(session): Promise<AccessKey[]>` — flattens `svcaccs` across returned users
  - `createAccessKey(session): Promise<{ accessKey: string; secretKey: string }>`
  - `deleteAccessKey(session, accessKey: string): Promise<void>`

- [ ] **Step 1: Implement `lib/admin/keys.ts`**

```ts
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
```

- [ ] **Step 2: Implement `app/(app)/keys/actions.ts`**

```ts
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
```

- [ ] **Step 3: Implement `app/(app)/keys/keys-client.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createKeyAction, deleteKeyAction } from './actions'

export function CreateKey() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ accessKey: string; secretKey: string } | null>(null)

  async function create() {
    setBusy(true)
    const r = await createKeyAction()
    setBusy(false)
    if (r.error) { alert(r.error); return }
    setCreated({ accessKey: r.accessKey!, secretKey: r.secretKey! })
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <button onClick={create} disabled={busy}
        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
        {busy ? 'Creating…' : 'Create access key'}
      </button>
      {created && (
        <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
          <p className="font-medium text-amber-900 dark:text-amber-200">Save this secret now — it won’t be shown again.</p>
          <p className="mt-1 font-mono break-all">Access key: {created.accessKey}</p>
          <p className="font-mono break-all">Secret key: {created.secretKey}</p>
          <button onClick={() => setCreated(null)} className="mt-2 text-xs text-amber-800 underline dark:text-amber-300">Dismiss</button>
        </div>
      )}
    </div>
  )
}

export function DeleteKey({ accessKey }: { accessKey: string }) {
  const router = useRouter()
  async function del() {
    if (!confirm(`Delete access key ${accessKey}?`)) return
    const r = await deleteKeyAction(accessKey)
    if (r.error) alert(r.error)
    else router.refresh()
  }
  return <button onClick={del} className="text-sm text-red-600 hover:underline">Delete</button>
}
```

- [ ] **Step 4: Replace `app/(app)/keys/page.tsx`**

```tsx
import { requireSession } from '@/lib/session'
import { listAccessKeys } from '@/lib/admin/keys'
import { toUserMessage } from '@/lib/errors'
import { CreateKey, DeleteKey } from './keys-client'

export default async function KeysPage() {
  const session = await requireSession()
  let keys: Awaited<ReturnType<typeof listAccessKeys>> = []
  let error: string | null = null
  try {
    keys = await listAccessKeys(session)
  } catch (err) {
    error = toUserMessage(err)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Access Keys</h1>
      </div>
      <CreateKey />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && keys.length === 0 && <p className="text-sm text-zinc-500">No access keys yet.</p>}
      {keys.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {keys.map((k) => (
            <li key={k.accessKey} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="font-mono text-sm text-zinc-900 dark:text-zinc-50">{k.accessKey}</div>
                <div className="text-xs text-zinc-500">{k.parentUser} · {k.status}</div>
              </div>
              <DeleteKey accessKey={k.accessKey} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Write the e2e — `e2e/admin.spec.ts`**

```ts
import { test, expect, type Page } from '@playwright/test'

const ACCESS = process.env.MW_TEST_ACCESS_KEY
const SECRET = process.env.MW_TEST_SECRET_KEY
test.skip(!ACCESS || !SECRET, 'set MW_TEST_ACCESS_KEY / MW_TEST_SECRET_KEY to run')

async function loginUI(page: Page) {
  await page.goto('/login')
  await page.fill('input[name=accessKey]', ACCESS!)
  await page.fill('input[name=secretKey]', SECRET!)
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/buckets/)
}

test('create and delete an access key', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await loginUI(page)
  await page.goto('/keys')
  await page.getByRole('button', { name: 'Create access key' }).click()
  const panel = page.locator('text=won’t be shown again')
  await expect(panel).toBeVisible()
  // capture the created access key from the panel
  const akText = await page.locator('p', { hasText: 'Access key:' }).first().innerText()
  const ak = akText.replace('Access key:', '').trim()
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText(ak, { exact: false })).toBeVisible()
  await page.locator('li', { hasText: ak }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(ak, { exact: false })).toHaveCount(0)
})
```

- [ ] **Step 6: Verify + run e2e**

Run: `npx tsc --noEmit && npm run lint && npm run build`, then
`MW_TEST_ACCESS_KEY=mulanadmin MW_TEST_SECRET_KEY='<root-pw>' npm run e2e -- admin.spec.ts`
Expected: PASS. (Verify MinIO first: `curl -fsS http://100.86.43.70:9100/minio/health/live`.)

- [ ] **Step 7: Commit**

```bash
git add lib/admin/keys.ts "app/(app)/keys" e2e/admin.spec.ts
git commit -m "feat: access keys page (list, create, delete) + e2e"
```

---

## Task 3: Users page

**Files:**
- Create: `lib/admin/users.ts`
- Create: `app/(app)/users/actions.ts`, `app/(app)/users/users-client.tsx`
- Modify: `app/(app)/users/page.tsx` (replace stub)
- Modify: `e2e/admin.spec.ts` (append user lifecycle test)

**Interfaces:**
- Produces (`lib/admin/users.ts`):
  - `type MinioUser = { accessKey: string; status: string }`
  - `listUsers(session): Promise<MinioUser[]>`
  - `createUser(session, accessKey: string, secretKey: string): Promise<void>`
  - `deleteUser(session, accessKey: string): Promise<void>`
  - `setUserStatus(session, accessKey: string, enabled: boolean): Promise<void>` (uses `enable`/`disable`)

- [ ] **Step 1: Implement `lib/admin/users.ts`**

```ts
import { runMc, ALIAS } from '@/lib/mc'
import type { Creds } from '@/lib/session-crypto'

export type MinioUser = { accessKey: string; status: string }

export async function listUsers(session: Creds): Promise<MinioUser[]> {
  const lines = await runMc(session, ['admin', 'user', 'ls', ALIAS])
  return lines.map((l) => ({ accessKey: l.accessKey, status: l.userStatus ?? '' }))
}

export async function createUser(session: Creds, accessKey: string, secretKey: string): Promise<void> {
  await runMc(session, ['admin', 'user', 'add', ALIAS, accessKey, secretKey])
}

export async function deleteUser(session: Creds, accessKey: string): Promise<void> {
  await runMc(session, ['admin', 'user', 'remove', ALIAS, accessKey])
}

export async function setUserStatus(session: Creds, accessKey: string, enabled: boolean): Promise<void> {
  await runMc(session, ['admin', 'user', enabled ? 'enable' : 'disable', ALIAS, accessKey])
}
```

- [ ] **Step 2: Implement `app/(app)/users/actions.ts`**

```ts
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
```

> **Note:** this task imports `attachPolicy` from `lib/admin/policies.ts`, which Task 4 creates. Implement Task 3 and Task 4 together, or stub `attachPolicy` first. To keep tasks independently testable, the reviewer/e2e for the attach control lands in Task 4; Task 3's e2e covers create/enable/disable/delete only.

- [ ] **Step 3: Implement `app/(app)/users/users-client.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { createUserAction, deleteUserAction, setStatusAction, attachPolicyAction } from './actions'

export function CreateUser() {
  const [state, action, pending] = useActionState(createUserAction, { error: null as string | null })
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input name="accessKey" placeholder="username / access key"
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
      <input name="secretKey" type="password" placeholder="secret key"
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
      <button disabled={pending}
        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
        {pending ? 'Creating…' : 'Create user'}
      </button>
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
    </form>
  )
}

export function UserRow({ accessKey, status, policies }: { accessKey: string; status: string; policies: string[] }) {
  const router = useRouter()
  const enabled = status === 'enabled'
  async function toggle() {
    const r = await setStatusAction(accessKey, !enabled)
    if (r.error) alert(r.error); else router.refresh()
  }
  async function del() {
    if (!confirm(`Delete user ${accessKey}?`)) return
    const r = await deleteUserAction(accessKey)
    if (r.error) alert(r.error); else router.refresh()
  }
  async function attach(policy: string) {
    if (!policy) return
    const r = await attachPolicyAction(accessKey, policy)
    if (r.error) alert(r.error); else router.refresh()
  }
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <div>
        <div className="font-medium text-zinc-900 dark:text-zinc-50">{accessKey}</div>
        <div className="text-xs text-zinc-500">{status}</div>
      </div>
      <div className="flex items-center gap-3">
        <select defaultValue="" onChange={(e) => attach(e.target.value)}
          className="rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800">
          <option value="" disabled>Attach policy…</option>
          {policies.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={toggle} className="text-sm text-blue-600 hover:underline">{enabled ? 'Disable' : 'Enable'}</button>
        <button onClick={del} className="text-sm text-red-600 hover:underline">Delete</button>
      </div>
    </li>
  )
}
```

- [ ] **Step 4: Replace `app/(app)/users/page.tsx`**

```tsx
import { requireSession } from '@/lib/session'
import { listUsers } from '@/lib/admin/users'
import { listPolicies } from '@/lib/admin/policies'
import { toUserMessage } from '@/lib/errors'
import { CreateUser, UserRow } from './users-client'

export default async function UsersPage() {
  const session = await requireSession()
  let users: Awaited<ReturnType<typeof listUsers>> = []
  let policies: string[] = []
  let error: string | null = null
  try {
    users = await listUsers(session)
    policies = (await listPolicies(session)).map((p) => p.name)
  } catch (err) {
    error = toUserMessage(err)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Users</h1>
        <CreateUser />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && users.length === 0 && <p className="text-sm text-zinc-500">No users yet.</p>}
      {users.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {users.map((u) => <UserRow key={u.accessKey} accessKey={u.accessKey} status={u.status} policies={policies} />)}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Append user e2e to `e2e/admin.spec.ts`**

```ts
test('create, disable, and delete a user', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await loginUI(page)
  await page.goto('/users')
  const uname = 'e2e-probe-user'
  if (await page.getByText(uname, { exact: true }).count()) {
    await page.locator('li', { hasText: uname }).getByRole('button', { name: 'Delete' }).click()
  }
  await page.fill('input[name=accessKey]', uname)
  await page.fill('input[name=secretKey]', 'e2e-secret-123')
  await page.getByRole('button', { name: 'Create user' }).click()
  await expect(page.getByText(uname, { exact: true })).toBeVisible()
  await page.locator('li', { hasText: uname }).getByRole('button', { name: 'Disable' }).click()
  await expect(page.locator('li', { hasText: uname })).toContainText('disabled')
  await page.locator('li', { hasText: uname }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(uname, { exact: true })).toHaveCount(0)
})
```

- [ ] **Step 6: Verify + run e2e** (same commands as Task 2). Both admin tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/admin/users.ts "app/(app)/users" e2e/admin.spec.ts
git commit -m "feat: users page (list, create, enable/disable, delete, attach policy) + e2e"
```

---

## Task 4: Policies page (+ `attachPolicy`/`detachPolicy` used by Users)

**Files:**
- Create: `lib/admin/policies.ts`
- Create: `app/(app)/policies/actions.ts`, `app/(app)/policies/policies-client.tsx`
- Modify: `app/(app)/policies/page.tsx` (replace stub)

**Interfaces:**
- Produces (`lib/admin/policies.ts`):
  - `type Policy = { name: string; builtin: boolean }`
  - `listPolicies(session): Promise<Policy[]>`
  - `getPolicy(session, name): Promise<unknown>` — the policy document (`policyInfo.Policy`)
  - `createPolicy(session, name, document: string): Promise<void>` — writes `document` to a temp file, `mc admin policy create`
  - `attachPolicy(session, user, policy): Promise<void>`
  - `detachPolicy(session, user, policy): Promise<void>`

- [ ] **Step 1: Implement `lib/admin/policies.ts`**

```ts
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runMc, ALIAS } from '@/lib/mc'
import type { Creds } from '@/lib/session-crypto'

export type Policy = { name: string; builtin: boolean }

const BUILTINS = new Set(['consoleAdmin', 'diagnostics', 'readonly', 'readwrite', 'writeonly'])

export async function listPolicies(session: Creds): Promise<Policy[]> {
  const lines = await runMc(session, ['admin', 'policy', 'ls', ALIAS])
  return lines.map((l) => ({ name: l.policy, builtin: BUILTINS.has(l.policy) }))
}

export async function getPolicy(session: Creds, name: string): Promise<unknown> {
  const [res] = await runMc(session, ['admin', 'policy', 'info', ALIAS, name])
  return res.policyInfo?.Policy ?? null
}

export async function createPolicy(session: Creds, name: string, document: string): Promise<void> {
  // mc admin policy create needs the document in a file. Use a unique temp file per call.
  const file = join(tmpdir(), `mw-policy-${encodeURIComponent(name)}-${process.pid}.json`)
  await writeFile(file, document, 'utf8')
  try {
    await runMc(session, ['admin', 'policy', 'create', ALIAS, name, file])
  } finally {
    await unlink(file).catch(() => {})
  }
}

export async function attachPolicy(session: Creds, user: string, policy: string): Promise<void> {
  await runMc(session, ['admin', 'policy', 'attach', ALIAS, policy, '--user', user])
}

export async function detachPolicy(session: Creds, user: string, policy: string): Promise<void> {
  await runMc(session, ['admin', 'policy', 'detach', ALIAS, policy, '--user', user])
}
```

- [ ] **Step 2: Implement `app/(app)/policies/actions.ts`**

```ts
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
```

- [ ] **Step 3: Implement `app/(app)/policies/policies-client.tsx`**

```tsx
'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { viewPolicyAction, createPolicyAction } from './actions'

export function ViewPolicy({ name }: { name: string }) {
  const [doc, setDoc] = useState<string | null>(null)
  async function view() {
    const r = await viewPolicyAction(name)
    if (r.error) { alert(r.error); return }
    setDoc(r.document ?? '')
  }
  return (
    <div>
      <button onClick={doc ? () => setDoc(null) : view} className="text-sm text-blue-600 hover:underline">
        {doc ? 'Hide' : 'View'}
      </button>
      {doc && (
        <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-zinc-100 p-3 text-xs dark:bg-zinc-900">{doc}</pre>
      )}
    </div>
  )
}

export function CreatePolicy() {
  const router = useRouter()
  const [state, action, pending] = useActionState(async (prev: { error: string | null }, fd: FormData) => {
    const r = await createPolicyAction(prev, fd)
    if (!r.error) router.refresh()
    return r
  }, { error: null as string | null })
  return (
    <form action={action} className="space-y-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <input name="name" placeholder="policy-name"
        className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
      <textarea name="document" rows={8} placeholder='{"Version":"2012-10-17","Statement":[…]}'
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800" />
      <div className="flex items-center gap-3">
        <button disabled={pending}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
          {pending ? 'Creating…' : 'Create policy'}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Replace `app/(app)/policies/page.tsx`**

```tsx
import { requireSession } from '@/lib/session'
import { listPolicies } from '@/lib/admin/policies'
import { toUserMessage } from '@/lib/errors'
import { ViewPolicy, CreatePolicy } from './policies-client'

export default async function PoliciesPage() {
  const session = await requireSession()
  let policies: Awaited<ReturnType<typeof listPolicies>> = []
  let error: string | null = null
  try {
    policies = await listPolicies(session)
  } catch (err) {
    error = toUserMessage(err)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Policies</h1>
      <CreatePolicy />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {policies.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {policies.map((p) => (
            <li key={p.name} className="flex items-start justify-between gap-4 px-4 py-3">
              <div>
                <div className="font-medium text-zinc-900 dark:text-zinc-50">{p.name}</div>
                {p.builtin && <div className="text-xs text-zinc-500">built-in</div>}
              </div>
              <ViewPolicy name={p.name} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Verify + e2e** — `npx tsc --noEmit && npm run lint && npm run build`. Then run the full admin e2e; the Users page's "Attach policy" dropdown now resolves (`listPolicies` exists). Add a minimal policy-view assertion to `e2e/admin.spec.ts` if quick, else rely on build + existing tests. Confirm the previously-broken `attachPolicy` import (Task 3) now compiles.

```ts
test('view a built-in policy document', async ({ page }) => {
  await loginUI(page)
  await page.goto('/policies')
  await page.locator('li', { hasText: 'readonly' }).getByRole('button', { name: 'View' }).click()
  await expect(page.locator('pre')).toContainText('s3:GetObject')
})
```

- [ ] **Step 6: Commit**

```bash
git add lib/admin/policies.ts "app/(app)/policies" e2e/admin.spec.ts
git commit -m "feat: policies page (list, view, create) + attach/detach used by users"
```

---

## Task 5: Metrics dashboard

**Files:**
- Create: `lib/admin/info.ts`
- Modify: `app/(app)/metrics/page.tsx` (replace stub)

**Interfaces:**
- Produces (`lib/admin/info.ts`):
  - `type ServerInfo = { mode: string; buckets: number; objects: number; usageSize: number; onlineDisks: number; offlineDisks: number; servers: { endpoint: string; state: string; uptime: number; version: string; drives: { state: string; path: string; total: number; used: number; avail: number }[] }[] }`
  - `getServerInfo(session): Promise<ServerInfo>`

- [ ] **Step 1: Implement `lib/admin/info.ts`**

```ts
import { runMc, ALIAS } from '@/lib/mc'
import type { Creds } from '@/lib/session-crypto'

export type ServerInfo = {
  mode: string
  buckets: number
  objects: number
  usageSize: number
  onlineDisks: number
  offlineDisks: number
  servers: { endpoint: string; state: string; uptime: number; version: string
    drives: { state: string; path: string; total: number; used: number; avail: number }[] }[]
}

export async function getServerInfo(session: Creds): Promise<ServerInfo> {
  const [res] = await runMc(session, ['admin', 'info', ALIAS])
  const info = res.info ?? {}
  return {
    mode: info.mode ?? 'unknown',
    buckets: info.buckets?.count ?? 0,
    objects: info.objects?.count ?? 0,
    usageSize: info.usage?.size ?? 0,
    onlineDisks: info.backend?.onlineDisks ?? 0,
    offlineDisks: info.backend?.offlineDisks ?? 0,
    servers: (info.servers ?? []).map((s: any) => ({
      endpoint: s.endpoint, state: s.state, uptime: s.uptime ?? 0, version: s.version ?? '',
      drives: (s.drives ?? []).map((d: any) => ({
        state: d.state, path: d.path, total: d.totalspace ?? 0, used: d.usedspace ?? 0, avail: d.availspace ?? 0,
      })),
    })),
  }
}
```

- [ ] **Step 2: Replace `app/(app)/metrics/page.tsx`**

```tsx
import { requireSession } from '@/lib/session'
import { getServerInfo } from '@/lib/admin/info'
import { toUserMessage } from '@/lib/errors'

function gib(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1) + ' GiB'
}
function uptime(seconds: number): string {
  const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600)
  return d > 0 ? `${d}d ${h}h` : `${h}h`
}

export default async function MetricsPage() {
  const session = await requireSession()
  let info: Awaited<ReturnType<typeof getServerInfo>> | null = null
  let error: string | null = null
  try {
    info = await getServerInfo(session)
  } catch (err) {
    error = toUserMessage(err)
  }

  if (error) return <div className="space-y-4"><h1 className="text-2xl font-semibold">Metrics</h1><p className="text-sm text-red-600">{error}</p></div>

  const totals = info!.servers.flatMap((s) => s.drives)
  const total = totals.reduce((a, d) => a + d.total, 0)
  const used = totals.reduce((a, d) => a + d.used, 0)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Metrics</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card label="Status" value={info!.mode} />
        <Card label="Storage used" value={`${gib(used)} / ${gib(total)}`} />
        <Card label="Buckets" value={String(info!.buckets)} />
        <Card label="Objects" value={String(info!.objects)} />
        <Card label="Drives online" value={`${info!.onlineDisks} online / ${info!.offlineDisks} offline`} />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-medium text-zinc-500">Servers</h2>
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {info!.servers.map((s) => (
            <li key={s.endpoint} className="px-4 py-3">
              <div className="flex justify-between">
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{s.endpoint}</span>
                <span className="text-xs text-zinc-500">{s.state} · up {uptime(s.uptime)} · {s.version}</span>
              </div>
              {s.drives.map((d) => (
                <div key={d.path} className="mt-1 text-xs text-zinc-500">{d.path} — {d.state} — {gib(d.used)} / {gib(d.total)} used</div>
              ))}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{value}</div>
    </div>
  )
}
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit && npm run lint && npm run build`. Optional manual check against live MinIO shows storage/drives/uptime.

- [ ] **Step 4: Commit**

```bash
git add lib/admin/info.ts "app/(app)/metrics"
git commit -m "feat: metrics dashboard (status, storage, drives, uptime)"
```

---

## Task 6: Full sweep + README + nav polish

**Files:**
- Modify: `README.md` (document `mc` runtime dependency + the new admin pages)

- [ ] **Step 1: README** — add a note that the console shells out to `mc` for admin features, so `mc` must be on `PATH` on the host (installed at `/usr/local/bin/mc` on the deploy host); list the new pages (Access Keys, Users, Policies, Metrics).

- [ ] **Step 2: Full unit sweep** — `npm test`. Expected: prior suites + `mc` (5) all pass.

- [ ] **Step 3: Type/lint/build** — `npx tsc --noEmit && npm run lint && npm run build`. All four admin routes render (not stubs).

- [ ] **Step 4: Full e2e** — verify MinIO, then `MW_TEST_ACCESS_KEY=mulanadmin MW_TEST_SECRET_KEY='<root-pw>' npm run e2e`. Expected: bucket tests (2) + admin tests all pass, self-cleaning.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document mc runtime dependency and admin pages"
```

---

## Self-Review Notes

- **Spec coverage:** Access keys → Task 2. Users → Task 3. Policies (+ attach/detach used by users) → Task 4. Metrics → Task 5. The `mc` subprocess foundation → Task 1. All four stub pages replaced.
- **Cross-task dependency:** Task 3's `users/actions.ts` imports `attachPolicy` from Task 4's `lib/admin/policies.ts`, and `users/page.tsx` imports `listPolicies`. Implement Tasks 3 and 4 in order; Task 3 will not typecheck until Task 4 exists (or stub `lib/admin/policies.ts` with the two functions first). The plan notes this at Task 3 Step 2.
- **Type consistency:** `Creds`, `runMc`/`ALIAS`, the admin wrapper return types, and action envelopes (`{ error: string | null }`) are consistent across tasks.
- **Injection:** all `mc` calls use `execFile` with argv arrays; user input never reaches a shell. Policy documents go through a temp file, not the command line.
- **No placeholders:** every code step is complete.
