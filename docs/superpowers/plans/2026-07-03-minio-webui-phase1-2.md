# MinIO Web Console — Phase 1–2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a logged-in MinIO web console with a working bucket/object browser (login → browse buckets → browse a bucket → upload/download/delete objects → create folders/buckets).

**Architecture:** Next.js 16 App Router. Auth = user's MinIO access/secret key encrypted (AES-256-GCM) into an httpOnly cookie; the `(app)` layout and every server data function re-check the session. Object listing/bucket ops use `@aws-sdk/client-s3` against MinIO over `127.0.0.1:9100`; uploads/downloads use **presigned URLs** signed against the browser-reachable `100.86.43.70:9100` so bytes never pass through Next. Reads happen in Server Components; mutations in Server Actions.

**Tech Stack:** Next.js 16.2.10, React 19, Tailwind v4, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, Node `crypto`, vitest (unit), Playwright (e2e).

## Global Constraints

- **Next.js 16 breaking changes** (per project `AGENTS.md` — read `node_modules/next/dist/docs/` before coding):
  - The middleware file convention is **`proxy.ts`**, not `middleware.ts`. This plan does **not** use it — auth is guarded in the `(app)` layout + session helper instead (Next's data-security guidance: verify auth inside server functions, not only at the edge).
  - `cookies()` from `next/headers` is **async** — always `await cookies()`. Cookies may only be **set/deleted inside a Server Action or Route Handler**, never during Server Component render.
- **Path alias:** `@/*` → repo root (e.g. `@/lib/session`). No `src/` dir; `app/` is at root.
- **Money/other domain rules:** none in this phase.
- **MinIO endpoints (env):**
  - `MINIO_INTERNAL_ENDPOINT=http://127.0.0.1:9100` — server-side list/sign
  - `MINIO_PUBLIC_ENDPOINT=http://100.86.43.70:9100` — presigned URLs (browser-reachable host; SigV4 signs Host)
  - `SESSION_SECRET` — ≥32 chars, used to derive the AES key
- **S3 client settings for MinIO:** `region: 'us-east-1'`, `forcePathStyle: true`.
- **Cookie name:** `mw_session`. Options: `httpOnly: true`, `sameSite: 'lax'`, `secure: true`, `path: '/'`, `maxAge: 60*60*8`.
- **Live e2e** run against the real MinIO on coffee-server: `MW_TEST_ACCESS_KEY` / `MW_TEST_SECRET_KEY` env (root creds `mulanadmin` / the generated password). e2e tasks are skipped when those env vars are absent.
- **TDD:** write the failing test first for every unit with pure logic. S3/UI integration is covered by Playwright e2e (live MinIO), not mocked.
- **Commit** after every task's tests pass.

## File Structure

**Phase 1 — Foundation**
- `lib/config.ts` — read + validate env; export `config` (endpoints, sessionSecret, cookie constants)
- `lib/session.ts` — `encryptSession`/`decryptSession` (pure AES-GCM) + `getSession`/`setSessionCookie`/`clearSessionCookie` (cookie glue)
- `lib/s3.ts` — `makeS3Client`, `validateCredentials` (login check)
- `lib/errors.ts` — `toUserMessage(err)` mapping
- `app/login/page.tsx` + `app/login/actions.ts` — login form + Server Action
- `app/logout/route.ts` — clears cookie, redirects `/login`
- `app/(app)/layout.tsx` — session guard + shell (sidebar nav + header)
- `app/globals.css` — already exists (Tailwind v4)
- Test infra: `vitest.config.ts`, `playwright.config.ts`, `e2e/`

**Phase 2 — Object browser**
- `lib/s3.ts` (extended) — `listBuckets`, `createBucket`, `deleteBucket`, `listObjects`, `presignGet`, `presignPut`, `deleteObject`, `putEmptyFolder`
- `lib/paths.ts` — pure prefix/breadcrumb/key helpers
- `app/(app)/buckets/page.tsx` + `actions.ts` — bucket list + create/delete
- `app/(app)/buckets/[bucket]/[[...prefix]]/page.tsx` + `actions.ts` — object browser + object mutations
- `app/(app)/buckets/[bucket]/[[...prefix]]/browser-client.tsx` — client component (upload/download/delete UI)

---

## Task 1: Project deps, env, and test infra

**Files:**
- Modify: `package.json` (deps + scripts)
- Create: `.env.local`, `.env.example`, `vitest.config.ts`, `.gitignore` (append)
- Create: `lib/config.ts`
- Test: `lib/config.spec.ts`

**Interfaces:**
- Produces: `config: { internalEndpoint: string; publicEndpoint: string; sessionSecret: string; cookieName: string; cookieMaxAge: number }`, and `loadConfig(env: Record<string,string|undefined>): typeof config` (pure, for tests).

- [ ] **Step 1: Install dependencies**

Run:
```bash
cd /home/nate/Dev/minio-webui
npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm i -D vitest @playwright/test
```
Expected: installs succeed, `package.json` updated.

- [ ] **Step 2: Add test scripts to `package.json`**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest",
"e2e": "playwright test"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.spec.ts'],
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    // lib/config.ts calls loadConfig(process.env) at import time; provide
    // valid values so importing any module that touches config doesn't throw.
    env: {
      MINIO_INTERNAL_ENDPOINT: 'http://127.0.0.1:9100',
      MINIO_PUBLIC_ENDPOINT: 'http://100.86.43.70:9100',
      SESSION_SECRET: 'test-session-secret-at-least-32-characters',
    },
  },
  resolve: {
    alias: { '@': __dirname },
  },
})
```

- [ ] **Step 4: Create `.env.example` and `.env.local`**

`.env.example`:
```bash
MINIO_INTERNAL_ENDPOINT=http://127.0.0.1:9100
MINIO_PUBLIC_ENDPOINT=http://100.86.43.70:9100
SESSION_SECRET=change-me-to-a-long-random-string-min-32-chars
```
`.env.local` (same, with a real 32+ char `SESSION_SECRET` — generate with `openssl rand -base64 32`). Append `.env.local` to `.gitignore` if not already ignored (create-next-app ignores `.env*` by default — verify).

- [ ] **Step 5: Write the failing test — `lib/config.spec.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { loadConfig } from '@/lib/config'

const good = {
  MINIO_INTERNAL_ENDPOINT: 'http://127.0.0.1:9100',
  MINIO_PUBLIC_ENDPOINT: 'http://100.86.43.70:9100',
  SESSION_SECRET: 'x'.repeat(32),
}

describe('loadConfig', () => {
  it('reads endpoints and secret', () => {
    const c = loadConfig(good)
    expect(c.internalEndpoint).toBe('http://127.0.0.1:9100')
    expect(c.publicEndpoint).toBe('http://100.86.43.70:9100')
    expect(c.cookieName).toBe('mw_session')
  })

  it('throws when SESSION_SECRET is too short', () => {
    expect(() => loadConfig({ ...good, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/)
  })

  it('throws when an endpoint is missing', () => {
    expect(() => loadConfig({ ...good, MINIO_INTERNAL_ENDPOINT: undefined })).toThrow(/MINIO_INTERNAL_ENDPOINT/)
  })
})
```

- [ ] **Step 6: Run test — verify it fails**

Run: `npm test -- lib/config.spec.ts`
Expected: FAIL (`loadConfig` not found / module missing).

- [ ] **Step 7: Implement `lib/config.ts`**

```ts
type Env = Record<string, string | undefined>

export function loadConfig(env: Env) {
  const internalEndpoint = env.MINIO_INTERNAL_ENDPOINT
  const publicEndpoint = env.MINIO_PUBLIC_ENDPOINT
  const sessionSecret = env.SESSION_SECRET

  if (!internalEndpoint) throw new Error('MINIO_INTERNAL_ENDPOINT is required')
  if (!publicEndpoint) throw new Error('MINIO_PUBLIC_ENDPOINT is required')
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET is required and must be at least 32 characters')
  }

  return {
    internalEndpoint,
    publicEndpoint,
    sessionSecret,
    cookieName: 'mw_session',
    cookieMaxAge: 60 * 60 * 8,
  }
}

export const config = loadConfig(process.env)
```

- [ ] **Step 8: Run test — verify it passes**

Run: `npm test -- lib/config.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.ts .env.example lib/config.ts lib/config.spec.ts .gitignore
git commit -m "feat: project deps, env config, vitest setup"
```

---

## Task 2: Session credential encryption (pure crypto)

**Files:**
- Create: `lib/session-crypto.ts`
- Test: `lib/session-crypto.spec.ts`

**Interfaces:**
- Produces:
  - `type Creds = { accessKey: string; secretKey: string }`
  - `encryptSession(creds: Creds, secret: string): string` (opaque base64url token)
  - `decryptSession(token: string, secret: string): Creds | null` (null on tamper/garbage)

- [ ] **Step 1: Write the failing test — `lib/session-crypto.spec.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { encryptSession, decryptSession } from '@/lib/session-crypto'

const secret = 'test-secret-that-is-at-least-32-characters-long'
const creds = { accessKey: 'AKIA', secretKey: 's3cr3t/value+with=chars' }

describe('session-crypto', () => {
  it('round-trips creds', () => {
    const token = encryptSession(creds, secret)
    expect(token).not.toContain('s3cr3t')
    expect(decryptSession(token, secret)).toEqual(creds)
  })

  it('returns null on a tampered token', () => {
    const token = encryptSession(creds, secret)
    const tampered = token.slice(0, -2) + (token.endsWith('A') ? 'BB' : 'AA')
    expect(decryptSession(tampered, secret)).toBeNull()
  })

  it('returns null under a different secret', () => {
    const token = encryptSession(creds, secret)
    expect(decryptSession(token, 'another-secret-of-at-least-32-characters!!')).toBeNull()
  })

  it('returns null on garbage', () => {
    expect(decryptSession('not-a-token', secret)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npm test -- lib/session-crypto.spec.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `lib/session-crypto.ts`**

```ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export type Creds = { accessKey: string; secretKey: string }

function keyFrom(secret: string): Buffer {
  // Derive a fixed 32-byte key from the configured secret.
  return createHash('sha256').update(secret).digest()
}

export function encryptSession(creds: Creds, secret: string): string {
  const key = keyFrom(secret)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(creds), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url')
}

export function decryptSession(token: string, secret: string): Creds | null {
  try {
    const raw = Buffer.from(token, 'base64url')
    if (raw.length < 12 + 16 + 1) return null
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const ciphertext = raw.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), iv)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    const parsed = JSON.parse(plaintext.toString('utf8'))
    if (typeof parsed?.accessKey !== 'string' || typeof parsed?.secretKey !== 'string') return null
    return { accessKey: parsed.accessKey, secretKey: parsed.secretKey }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npm test -- lib/session-crypto.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/session-crypto.ts lib/session-crypto.spec.ts
git commit -m "feat: AES-256-GCM session credential encryption"
```

---

## Task 3: Session cookie helpers

**Files:**
- Create: `lib/session.ts`
- Test: none (thin glue over Task 2 + Next cookies; covered by e2e login in Task 6/Phase 2)

**Interfaces:**
- Consumes: `config` (Task 1), `encryptSession`/`decryptSession`/`Creds` (Task 2)
- Produces:
  - `getSession(): Promise<Creds | null>` — read + decrypt `mw_session`
  - `requireSession(): Promise<Creds>` — `getSession()` or `redirect('/login')`
  - `setSessionCookie(creds: Creds): Promise<void>` — encrypt + set cookie (call only in a Server Action/Route Handler)
  - `clearSessionCookie(): Promise<void>`

- [ ] **Step 1: Implement `lib/session.ts`**

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/session.ts
git commit -m "feat: session cookie helpers (get/require/set/clear)"
```

---

## Task 4: S3 client factory + credential validation + error mapping

**Files:**
- Create: `lib/s3.ts`
- Create: `lib/errors.ts`
- Test: `lib/errors.spec.ts`

**Interfaces:**
- Consumes: `config` (Task 1), `Creds` (Task 2/3)
- Produces:
  - `makeS3Client(creds: Creds, endpoint: string): S3Client`
  - `internalClient(creds)` / `publicClient(creds)` — bound to the two endpoints
  - `validateCredentials(creds: Creds): Promise<boolean>` — true if MinIO accepts the creds (auth ok, even if authz-limited)
  - `toUserMessage(err: unknown): string` (in `lib/errors.ts`)
  - `isAuthError(err: unknown): boolean` (in `lib/errors.ts`)

- [ ] **Step 1: Write the failing test — `lib/errors.spec.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { toUserMessage, isAuthError } from '@/lib/errors'

describe('errors', () => {
  it('maps invalid key to a friendly message and flags auth error', () => {
    const err = { name: 'InvalidAccessKeyId', message: 'bad key' }
    expect(isAuthError(err)).toBe(true)
    expect(toUserMessage(err)).toMatch(/invalid credentials/i)
  })

  it('maps bad signature as auth error', () => {
    expect(isAuthError({ name: 'SignatureDoesNotMatch' })).toBe(true)
  })

  it('maps access denied as NOT an auth error', () => {
    const err = { name: 'AccessDenied', message: 'no' }
    expect(isAuthError(err)).toBe(false)
    expect(toUserMessage(err)).toMatch(/not permitted/i)
  })

  it('falls back to the error message', () => {
    expect(toUserMessage({ message: 'boom' })).toBe('boom')
    expect(toUserMessage('weird')).toMatch(/unexpected/i)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npm test -- lib/errors.spec.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `lib/errors.ts`**

```ts
function nameOf(err: unknown): string {
  if (err && typeof err === 'object' && 'name' in err) return String((err as { name: unknown }).name)
  return ''
}

const AUTH_ERROR_NAMES = new Set(['InvalidAccessKeyId', 'SignatureDoesNotMatch', 'InvalidAccessKeyID'])

export function isAuthError(err: unknown): boolean {
  return AUTH_ERROR_NAMES.has(nameOf(err))
}

export function toUserMessage(err: unknown): string {
  const name = nameOf(err)
  if (AUTH_ERROR_NAMES.has(name)) return 'Invalid credentials'
  if (name === 'AccessDenied') return 'Not permitted'
  if (name === 'NoSuchBucket') return 'That bucket does not exist'
  if (name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists') return 'A bucket with that name already exists'
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  return 'An unexpected error occurred'
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npm test -- lib/errors.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement `lib/s3.ts` (factory + validation)**

```ts
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3'
import { config } from '@/lib/config'
import { isAuthError } from '@/lib/errors'
import type { Creds } from '@/lib/session-crypto'

export function makeS3Client(creds: Creds, endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: creds.accessKey, secretAccessKey: creds.secretKey },
  })
}

export const internalClient = (creds: Creds) => makeS3Client(creds, config.internalEndpoint)
export const publicClient = (creds: Creds) => makeS3Client(creds, config.publicEndpoint)

/** True when MinIO accepts the credentials (authenticated), even if the user
 *  lacks permission to list buckets. Only bad key / bad signature is a failure. */
export async function validateCredentials(creds: Creds): Promise<boolean> {
  try {
    await internalClient(creds).send(new ListBucketsCommand({}))
    return true
  } catch (err) {
    if (isAuthError(err)) return false
    return true // AccessDenied etc. = valid creds, limited perms
  }
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/s3.ts lib/errors.ts lib/errors.spec.ts
git commit -m "feat: S3 client factory, credential validation, error mapping"
```

---

## Task 5: Login page + Server Action + logout

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/login/actions.ts`
- Create: `app/logout/route.ts`
- Modify: `app/page.tsx` (redirect `/` → `/buckets`)

**Interfaces:**
- Consumes: `validateCredentials` (Task 4), `setSessionCookie`/`clearSessionCookie` (Task 3), `toUserMessage` (Task 4)
- Produces: working `/login` (form posts to `login` action), `/logout` route, `/` redirect.

- [ ] **Step 1: Implement `app/login/actions.ts`**

```ts
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
```

- [ ] **Step 2: Implement `app/login/page.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { login, type LoginState } from './actions'

const initial: LoginState = { error: null }

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, initial)
  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <form action={action} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-sm dark:bg-zinc-900">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">MinIO Console</h1>
        <label className="block space-y-1">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Access Key</span>
          <input name="accessKey" autoComplete="username" required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Secret Key</span>
          <input name="secretKey" type="password" autoComplete="current-password" required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800" />
        </label>
        {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
        <button type="submit" disabled={pending}
          className="w-full rounded-lg bg-zinc-900 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 3: Implement `app/logout/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/session'

export async function POST(request: Request) {
  await clearSessionCookie()
  return NextResponse.redirect(new URL('/login', request.url))
}
```

- [ ] **Step 4: Replace `app/page.tsx` with a redirect**

```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/buckets')
}
```

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Manual smoke (dev)**

Run: `npm run dev`, open `/login`, submit with wrong creds → "Invalid credentials"; submit with the real MinIO root creds → redirect to `/buckets` (will 404/500 until Task 7 — that's expected). Then `git`-commit.

- [ ] **Step 7: Commit**

```bash
git add app/login app/logout app/page.tsx
git commit -m "feat: login form + server action, logout route, root redirect"
```

---

## Task 6: `(app)` layout shell + session guard

**Files:**
- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/nav.tsx` (client component for active-link highlight)

**Interfaces:**
- Consumes: `requireSession` (Task 3)
- Produces: authenticated shell wrapping every `(app)` page; unauthenticated visitors are redirected to `/login`.

- [ ] **Step 1: Implement `app/(app)/nav.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items = [
  { href: '/buckets', label: 'Buckets' },
  { href: '/keys', label: 'Access Keys' },
  { href: '/users', label: 'Users' },
  { href: '/policies', label: 'Policies' },
  { href: '/metrics', label: 'Metrics' },
]

export function Nav() {
  const pathname = usePathname()
  return (
    <nav className="flex flex-col gap-1 p-3">
      {items.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + '/')
        return (
          <Link key={it.href} href={it.href}
            className={`rounded-lg px-3 py-2 text-sm ${active ? 'bg-zinc-200 font-medium dark:bg-zinc-800' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900'}`}>
            {it.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Implement `app/(app)/layout.tsx`**

```tsx
import { requireSession } from '@/lib/session'
import { config } from '@/lib/config'
import { Nav } from './nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  return (
    <div className="flex min-h-dvh bg-zinc-50 dark:bg-black">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800">
        <div className="p-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">MinIO Console</div>
        <Nav />
        <div className="mt-auto space-y-2 p-3 text-xs text-zinc-500">
          <div className="truncate">{session.accessKey}</div>
          <div className="truncate">{config.publicEndpoint}</div>
          <form action="/logout" method="post">
            <button className="w-full rounded-lg border border-zinc-300 py-1.5 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke**

`npm run dev`; visit `/buckets` while logged out → redirected to `/login`. (Full page arrives in Task 7.)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/layout.tsx" "app/(app)/nav.tsx"
git commit -m "feat: authenticated app shell with session guard and nav"
```

---

## Task 7: Bucket list + create + delete

**Files:**
- Extend: `lib/s3.ts` (`listBuckets`, `createBucket`, `deleteBucket`)
- Create: `app/(app)/buckets/page.tsx`
- Create: `app/(app)/buckets/actions.ts`
- Create: `app/(app)/buckets/create-bucket.tsx` (client form)
- Create: `playwright.config.ts`, `e2e/buckets.spec.ts`

**Interfaces:**
- Consumes: `requireSession`, `internalClient`, `toUserMessage`
- Produces:
  - `listBuckets(creds): Promise<{ name: string; creationDate?: Date }[]>`
  - `createBucket(creds, name): Promise<void>`
  - `deleteBucket(creds, name): Promise<void>`

- [ ] **Step 1: Extend `lib/s3.ts` with bucket ops**

Add:
```ts
import { CreateBucketCommand, DeleteBucketCommand } from '@aws-sdk/client-s3'

export async function listBuckets(creds: Creds) {
  const out = await internalClient(creds).send(new ListBucketsCommand({}))
  return (out.Buckets ?? []).map((b) => ({ name: b.Name!, creationDate: b.CreationDate }))
}

export async function createBucket(creds: Creds, name: string) {
  await internalClient(creds).send(new CreateBucketCommand({ Bucket: name }))
}

export async function deleteBucket(creds: Creds, name: string) {
  await internalClient(creds).send(new DeleteBucketCommand({ Bucket: name }))
}
```

- [ ] **Step 2: Implement `app/(app)/buckets/actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/session'
import { createBucket, deleteBucket } from '@/lib/s3'
import { toUserMessage } from '@/lib/errors'

export async function createBucketAction(_prev: { error: string | null }, formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Enter a bucket name' }
  try {
    await createBucket(await requireSession(), name)
  } catch (err) {
    return { error: toUserMessage(err) }
  }
  revalidatePath('/buckets')
  return { error: null }
}

export async function deleteBucketAction(formData: FormData) {
  const name = String(formData.get('name') ?? '')
  await deleteBucket(await requireSession(), name)
  revalidatePath('/buckets')
}
```

- [ ] **Step 3: Implement `app/(app)/buckets/create-bucket.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { createBucketAction } from './actions'

export function CreateBucket() {
  const [state, action, pending] = useActionState(createBucketAction, { error: null as string | null })
  return (
    <form action={action} className="flex items-center gap-2">
      <input name="name" placeholder="new-bucket-name"
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
      <button disabled={pending}
        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
        {pending ? 'Creating…' : 'Create bucket'}
      </button>
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
    </form>
  )
}
```

- [ ] **Step 4: Implement `app/(app)/buckets/page.tsx`**

```tsx
import Link from 'next/link'
import { requireSession } from '@/lib/session'
import { listBuckets } from '@/lib/s3'
import { toUserMessage } from '@/lib/errors'
import { CreateBucket } from './create-bucket'
import { deleteBucketAction } from './actions'

export default async function BucketsPage() {
  const session = await requireSession()
  let buckets: { name: string; creationDate?: Date }[] = []
  let error: string | null = null
  try {
    buckets = await listBuckets(session)
  } catch (err) {
    error = toUserMessage(err)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Buckets</h1>
        <CreateBucket />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && buckets.length === 0 && <p className="text-sm text-zinc-500">No buckets yet.</p>}
      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {buckets.map((b) => (
          <li key={b.name} className="flex items-center justify-between px-4 py-3">
            <Link href={`/buckets/${encodeURIComponent(b.name)}`} className="font-medium text-zinc-900 hover:underline dark:text-zinc-50">
              {b.name}
            </Link>
            <form action={deleteBucketAction}>
              <input type="hidden" name="name" value={b.name} />
              <button className="text-sm text-red-600 hover:underline">Delete</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 5: Create `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/login',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
```

- [ ] **Step 6: Write the e2e test — `e2e/buckets.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

const ACCESS = process.env.MW_TEST_ACCESS_KEY
const SECRET = process.env.MW_TEST_SECRET_KEY

test.skip(!ACCESS || !SECRET, 'set MW_TEST_ACCESS_KEY / MW_TEST_SECRET_KEY to run')

async function loginUI(page) {
  await page.goto('/login')
  await page.fill('input[name=accessKey]', ACCESS!)
  await page.fill('input[name=secretKey]', SECRET!)
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/buckets/)
}

test('login, create and delete a bucket', async ({ page }) => {
  await loginUI(page)
  const name = 'e2e-test-bucket-1' // deterministic; test cleans up at the end
  // ensure clean slate: if present, delete first
  if (await page.getByText(name, { exact: true }).count()) {
    await page.locator('li', { hasText: name }).getByRole('button', { name: 'Delete' }).click()
  }
  await page.fill('input[name=name]', name)
  await page.getByRole('button', { name: 'Create bucket' }).click()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
  await page.locator('li', { hasText: name }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(name, { exact: true })).toHaveCount(0)
})
```

- [ ] **Step 7: Run e2e against live MinIO**

Run:
```bash
MW_TEST_ACCESS_KEY=mulanadmin MW_TEST_SECRET_KEY='<root-password>' npm run e2e
```
Expected: PASS (or skipped if env unset). Requires a MinIO reachable from the dev machine (Tailscale) at the configured endpoints; for local dev set `MINIO_INTERNAL_ENDPOINT`/`MINIO_PUBLIC_ENDPOINT` to `http://100.86.43.70:9100`.

- [ ] **Step 8: Commit**

```bash
git add lib/s3.ts "app/(app)/buckets" playwright.config.ts e2e/buckets.spec.ts
git commit -m "feat: bucket list, create, delete + e2e"
```

---

## Task 8: Path helpers + object listing (browser page)

**Files:**
- Create: `lib/paths.ts`
- Test: `lib/paths.spec.ts`
- Extend: `lib/s3.ts` (`listObjects`)
- Create: `app/(app)/buckets/[bucket]/[[...prefix]]/page.tsx`

**Interfaces:**
- Produces (`lib/paths.ts`, all pure):
  - `prefixFromSegments(segments?: string[]): string` — join catch-all segments into an S3 prefix ending in `/` (or `''`)
  - `segmentsFromPrefix(prefix: string): string[]`
  - `breadcrumbs(bucket: string, prefix: string): { label: string; href: string }[]`
  - `displayName(keyOrPrefix: string, parentPrefix: string): string` — strip parent prefix and trailing slash
- Produces (`lib/s3.ts`):
  - `listObjects(creds, bucket, prefix, token?): Promise<{ folders: string[]; objects: { key: string; size: number; lastModified?: Date }[]; nextToken?: string }>`

- [ ] **Step 1: Write the failing test — `lib/paths.spec.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { prefixFromSegments, segmentsFromPrefix, breadcrumbs, displayName } from '@/lib/paths'

describe('paths', () => {
  it('builds a prefix from catch-all segments', () => {
    expect(prefixFromSegments(undefined)).toBe('')
    expect(prefixFromSegments([])).toBe('')
    expect(prefixFromSegments(['a', 'b'])).toBe('a/b/')
    expect(prefixFromSegments(['a b', 'c'])).toBe('a b/c/')
  })

  it('round-trips segments <-> prefix', () => {
    expect(segmentsFromPrefix('a/b/')).toEqual(['a', 'b'])
    expect(segmentsFromPrefix('')).toEqual([])
  })

  it('builds breadcrumbs', () => {
    expect(breadcrumbs('buck', 'a/b/')).toEqual([
      { label: 'buck', href: '/buckets/buck' },
      { label: 'a', href: '/buckets/buck/a' },
      { label: 'b', href: '/buckets/buck/a/b' },
    ])
  })

  it('derives a display name relative to the parent prefix', () => {
    expect(displayName('a/b/file.txt', 'a/b/')).toBe('file.txt')
    expect(displayName('a/b/sub/', 'a/b/')).toBe('sub')
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npm test -- lib/paths.spec.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `lib/paths.ts`**

```ts
export function prefixFromSegments(segments?: string[]): string {
  if (!segments || segments.length === 0) return ''
  return segments.map((s) => decodeURIComponent(s)).join('/') + '/'
}

export function segmentsFromPrefix(prefix: string): string[] {
  return prefix.replace(/\/+$/, '').split('/').filter(Boolean)
}

export function breadcrumbs(bucket: string, prefix: string) {
  const segs = segmentsFromPrefix(prefix)
  const crumbs = [{ label: bucket, href: `/buckets/${encodeURIComponent(bucket)}` }]
  let acc = `/buckets/${encodeURIComponent(bucket)}`
  for (const s of segs) {
    acc += `/${encodeURIComponent(s)}`
    crumbs.push({ label: s, href: acc })
  }
  return crumbs
}

export function displayName(keyOrPrefix: string, parentPrefix: string): string {
  const rest = keyOrPrefix.startsWith(parentPrefix) ? keyOrPrefix.slice(parentPrefix.length) : keyOrPrefix
  return rest.replace(/\/+$/, '')
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npm test -- lib/paths.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Extend `lib/s3.ts` with `listObjects`**

```ts
import { ListObjectsV2Command } from '@aws-sdk/client-s3'

export async function listObjects(creds: Creds, bucket: string, prefix: string, token?: string) {
  const out = await internalClient(creds).send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
    Delimiter: '/',
    ContinuationToken: token,
    MaxKeys: 200,
  }))
  const folders = (out.CommonPrefixes ?? []).map((p) => p.Prefix!).filter(Boolean)
  const objects = (out.Contents ?? [])
    .filter((o) => o.Key !== prefix) // drop the folder placeholder itself
    .map((o) => ({ key: o.Key!, size: o.Size ?? 0, lastModified: o.LastModified }))
  return { folders, objects, nextToken: out.NextContinuationToken }
}
```

- [ ] **Step 6: Implement `app/(app)/buckets/[bucket]/[[...prefix]]/page.tsx`**

```tsx
import Link from 'next/link'
import { requireSession } from '@/lib/session'
import { listObjects } from '@/lib/s3'
import { toUserMessage } from '@/lib/errors'
import { prefixFromSegments, breadcrumbs, displayName } from '@/lib/paths'

export default async function ObjectBrowser({ params }: { params: Promise<{ bucket: string; prefix?: string[] }> }) {
  const { bucket: rawBucket, prefix: segs } = await params
  const bucket = decodeURIComponent(rawBucket)
  const prefix = prefixFromSegments(segs)
  const session = await requireSession()

  let data: Awaited<ReturnType<typeof listObjects>> | null = null
  let error: string | null = null
  try {
    data = await listObjects(session, bucket, prefix)
  } catch (err) {
    error = toUserMessage(err)
  }

  const crumbs = breadcrumbs(bucket, prefix)

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
        {crumbs.map((c, i) => (
          <span key={c.href} className="flex items-center gap-1">
            {i > 0 && <span>/</span>}
            <Link href={c.href} className="hover:underline">{c.label}</Link>
          </span>
        ))}
      </nav>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {data?.folders.map((f) => (
          <li key={f} className="px-4 py-3">
            <Link href={`/buckets/${encodeURIComponent(bucket)}/${f.replace(/\/$/, '').split('/').map(encodeURIComponent).join('/')}`}
              className="font-medium text-zinc-900 hover:underline dark:text-zinc-50">
              📁 {displayName(f, prefix)}
            </Link>
          </li>
        ))}
        {data?.objects.map((o) => (
          <li key={o.key} className="flex items-center justify-between px-4 py-3">
            <span className="text-zinc-800 dark:text-zinc-200">📄 {displayName(o.key, prefix)}</span>
            <span className="text-xs text-zinc-500">{o.size} B</span>
          </li>
        ))}
        {data && data.folders.length === 0 && data.objects.length === 0 && (
          <li className="px-4 py-6 text-sm text-zinc-500">This folder is empty.</li>
        )}
      </ul>
    </div>
  )
}
```

- [ ] **Step 7: Type-check + manual smoke**

Run: `npx tsc --noEmit`. Then `npm run dev`, log in, click a bucket, confirm folders/objects render and breadcrumbs navigate.

- [ ] **Step 8: Commit**

```bash
git add lib/paths.ts lib/paths.spec.ts lib/s3.ts "app/(app)/buckets/[bucket]"
git commit -m "feat: object browser — path helpers, object listing, breadcrumb page"
```

---

## Task 9: Presigned download

**Files:**
- Extend: `lib/s3.ts` (`presignGet`)
- Create: `app/(app)/buckets/[bucket]/[[...prefix]]/actions.ts` (adds `downloadUrlAction`)
- Create: `app/(app)/buckets/[bucket]/[[...prefix]]/browser-client.tsx`
- Modify: page from Task 8 to render objects via the client component

**Interfaces:**
- Consumes: `requireSession`, `publicClient`
- Produces:
  - `presignGet(creds, bucket, key): Promise<string>` — presigned GET URL (public endpoint), 5-min expiry
  - `downloadUrlAction(bucket, key): Promise<string>` — Server Action returning the URL

- [ ] **Step 1: Extend `lib/s3.ts` with `presignGet`**

```ts
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export async function presignGet(creds: Creds, bucket: string, key: string): Promise<string> {
  return getSignedUrl(publicClient(creds), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 300 })
}
```

- [ ] **Step 2: Implement `app/(app)/buckets/[bucket]/[[...prefix]]/actions.ts`**

```ts
'use server'

import { requireSession } from '@/lib/session'
import { presignGet } from '@/lib/s3'

export async function downloadUrlAction(bucket: string, key: string): Promise<string> {
  return presignGet(await requireSession(), bucket, key)
}
```

- [ ] **Step 3: Implement `browser-client.tsx` (download button)**

```tsx
'use client'

import { displayName } from '@/lib/paths'
import { downloadUrlAction } from './actions'

type Obj = { key: string; size: number }

export function ObjectRow({ bucket, prefix, obj }: { bucket: string; prefix: string; obj: Obj }) {
  async function download() {
    const url = await downloadUrlAction(bucket, obj.key)
    window.location.href = url
  }
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <span className="text-zinc-800 dark:text-zinc-200">📄 {displayName(obj.key, prefix)}</span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500">{obj.size} B</span>
        <button onClick={download} className="text-sm text-blue-600 hover:underline">Download</button>
      </div>
    </li>
  )
}
```

- [ ] **Step 4: Wire `ObjectRow` into the page**

In `page.tsx` replace the inline object `<li>` with:
```tsx
{data?.objects.map((o) => (
  <ObjectRow key={o.key} bucket={bucket} prefix={prefix} obj={o} />
))}
```
and add `import { ObjectRow } from './browser-client'`.

- [ ] **Step 5: Type-check + manual smoke**

`npx tsc --noEmit`; dev: click Download on an object → file downloads directly from `100.86.43.70:9100`. Verify in devtools that the download request hits the public endpoint, not Next.

- [ ] **Step 6: Commit**

```bash
git add lib/s3.ts "app/(app)/buckets/[bucket]"
git commit -m "feat: presigned object download"
```

---

## Task 10: Presigned upload

**Files:**
- Extend: `lib/s3.ts` (`presignPut`)
- Extend: `.../actions.ts` (`uploadUrlAction`)
- Extend: `browser-client.tsx` (`UploadButton`)
- Modify: page to render the upload button + a client refresh after upload

**Interfaces:**
- Produces:
  - `presignPut(creds, bucket, key, contentType?): Promise<string>`
  - `uploadUrlAction(bucket, prefix, filename, contentType): Promise<string>` — presigns PUT for `prefix + filename`

- [ ] **Step 1: Extend `lib/s3.ts` with `presignPut`**

```ts
import { PutObjectCommand } from '@aws-sdk/client-s3'

export async function presignPut(creds: Creds, bucket: string, key: string, contentType?: string): Promise<string> {
  return getSignedUrl(publicClient(creds), new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn: 300 })
}
```

- [ ] **Step 2: Extend `actions.ts` with `uploadUrlAction`**

```ts
import { presignPut } from '@/lib/s3'

export async function uploadUrlAction(bucket: string, prefix: string, filename: string, contentType: string): Promise<string> {
  const key = prefix + filename
  return presignPut(await requireSession(), bucket, key, contentType)
}
```

- [ ] **Step 3: Add `UploadButton` to `browser-client.tsx`**

```tsx
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { uploadUrlAction } from './actions'

export function UploadButton({ bucket, prefix }: { bucket: string; prefix: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const url = await uploadUrlAction(bucket, prefix, file.name, file.type || 'application/octet-stream')
      const res = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } })
      if (!res.ok) throw new Error(`Upload failed (${res.status})`)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" hidden onChange={onPick} />
      <button disabled={busy} onClick={() => inputRef.current?.click()}
        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
        {busy ? 'Uploading…' : 'Upload file'}
      </button>
    </>
  )
}
```

- [ ] **Step 4: Render `UploadButton` in the page header**

Add near the breadcrumb row in `page.tsx`:
```tsx
<div className="flex items-center justify-between">
  {/* breadcrumb nav here */}
  <UploadButton bucket={bucket} prefix={prefix} />
</div>
```
and `import { ObjectRow, UploadButton } from './browser-client'`.

- [ ] **Step 5: Type-check + manual smoke**

`npx tsc --noEmit`; dev: pick a file → it uploads (PUT to `100.86.43.70:9100`) → list refreshes showing the new object. **Note:** MinIO must allow the browser origin; presigned PUT includes auth in the query string so no CORS preflight is needed for a simple `PUT` with `Content-Type`. If the browser blocks it, add a MinIO bucket CORS policy (document in Task 12 notes).

- [ ] **Step 6: Commit**

```bash
git add lib/s3.ts "app/(app)/buckets/[bucket]"
git commit -m "feat: presigned direct-to-MinIO upload"
```

---

## Task 11: Delete object + new folder

**Files:**
- Extend: `lib/s3.ts` (`deleteObject`, `putEmptyFolder`)
- Extend: `.../actions.ts` (`deleteObjectAction`, `newFolderAction`)
- Extend: `browser-client.tsx` (delete button on rows, new-folder form)

**Interfaces:**
- Produces:
  - `deleteObject(creds, bucket, key): Promise<void>`
  - `putEmptyFolder(creds, bucket, prefix, folderName): Promise<void>` — PUT zero-byte `prefix+folderName+'/'`
  - `deleteObjectAction(bucket, key, prefix): Promise<{ error: string | null }>`
  - `newFolderAction(bucket, prefix, name): Promise<{ error: string | null }>`

- [ ] **Step 1: Extend `lib/s3.ts`**

```ts
import { DeleteObjectCommand } from '@aws-sdk/client-s3'

export async function deleteObject(creds: Creds, bucket: string, key: string) {
  await internalClient(creds).send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

export async function putEmptyFolder(creds: Creds, bucket: string, prefix: string, folderName: string) {
  const key = prefix + folderName.replace(/\/+$/, '') + '/'
  await internalClient(creds).send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: '' }))
}
```

- [ ] **Step 2: Extend `actions.ts`**

```ts
import { revalidatePath } from 'next/cache'
import { deleteObject, putEmptyFolder } from '@/lib/s3'
import { toUserMessage } from '@/lib/errors'
import { segmentsFromPrefix } from '@/lib/paths'

function browsePath(bucket: string, prefix: string) {
  const segs = segmentsFromPrefix(prefix).map(encodeURIComponent)
  return `/buckets/${encodeURIComponent(bucket)}${segs.length ? '/' + segs.join('/') : ''}`
}

export async function deleteObjectAction(bucket: string, key: string, prefix: string) {
  try {
    await deleteObject(await requireSession(), bucket, key)
  } catch (err) {
    return { error: toUserMessage(err) }
  }
  revalidatePath(browsePath(bucket, prefix))
  return { error: null }
}

export async function newFolderAction(bucket: string, prefix: string, name: string) {
  const clean = name.trim()
  if (!clean) return { error: 'Enter a folder name' }
  try {
    await putEmptyFolder(await requireSession(), bucket, prefix, clean)
  } catch (err) {
    return { error: toUserMessage(err) }
  }
  revalidatePath(browsePath(bucket, prefix))
  return { error: null }
}
```

- [ ] **Step 3: Add delete + new-folder UI to `browser-client.tsx`**

Add a Delete button to `ObjectRow`:
```tsx
import { useRouter } from 'next/navigation'
import { deleteObjectAction } from './actions'
// inside ObjectRow:
const router = useRouter()
async function del() {
  if (!confirm(`Delete ${displayName(obj.key, prefix)}?`)) return
  const r = await deleteObjectAction(bucket, obj.key, prefix)
  if (r.error) alert(r.error); else router.refresh()
}
// add button next to Download:
<button onClick={del} className="text-sm text-red-600 hover:underline">Delete</button>
```

Add a `NewFolder` component:
```tsx
export function NewFolder({ bucket, prefix }: { bucket: string; prefix: string }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  async function create() {
    setBusy(true)
    const r = await newFolderAction(bucket, prefix, name)
    setBusy(false)
    if (r.error) alert(r.error)
    else { setName(''); router.refresh() }
  }
  return (
    <div className="flex items-center gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="new-folder"
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
      <button disabled={busy} onClick={create} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
        {busy ? 'Creating…' : 'New folder'}
      </button>
    </div>
  )
}
```
Import `newFolderAction` and `useState` at the top; render `<NewFolder .../>` in the page header row next to `UploadButton`.

- [ ] **Step 4: Type-check + manual smoke**

`npx tsc --noEmit`; dev: create a folder → appears; upload into it; delete the object → disappears.

- [ ] **Step 5: Extend e2e — append to `e2e/buckets.spec.ts`**

```ts
test('upload, download link, and delete an object', async ({ page }) => {
  await loginUI(page)
  const bucket = 'e2e-test-bucket-2'
  if (!(await page.getByText(bucket, { exact: true }).count())) {
    await page.fill('input[name=name]', bucket)
    await page.getByRole('button', { name: 'Create bucket' }).click()
    await expect(page.getByText(bucket, { exact: true })).toBeVisible()
  }
  await page.getByRole('link', { name: bucket }).click()
  await expect(page).toHaveURL(new RegExp(`/buckets/${bucket}`))

  const fileChooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload file' }).click()
  ;(await fileChooser).setFiles({ name: 'hello.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') })
  await expect(page.getByText('hello.txt')).toBeVisible()

  page.on('dialog', (d) => d.accept())
  await page.locator('li', { hasText: 'hello.txt' }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('hello.txt')).toHaveCount(0)
})
```

- [ ] **Step 6: Run e2e**

Run: `MW_TEST_ACCESS_KEY=mulanadmin MW_TEST_SECRET_KEY='<root-password>' npm run e2e`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/s3.ts "app/(app)/buckets/[bucket]" e2e/buckets.spec.ts
git commit -m "feat: object delete and new-folder + e2e"
```

---

## Task 12: Placeholder pages for later phases + full test sweep

**Files:**
- Create: `app/(app)/keys/page.tsx`, `app/(app)/users/page.tsx`, `app/(app)/policies/page.tsx`, `app/(app)/metrics/page.tsx` (each a stub: heading + "Coming soon")
- Create: `README.md` note on running + a MinIO bucket CORS snippet (for direct browser upload if needed)

**Interfaces:** none (stubs so the nav links don't 404 before Phases 3–5).

- [ ] **Step 1: Create the four stub pages**

For each (`keys`, `users`, `policies`, `metrics`), e.g. `app/(app)/keys/page.tsx`:
```tsx
export default function KeysPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Access Keys</h1>
      <p className="mt-4 text-sm text-zinc-500">Coming soon.</p>
    </div>
  )
}
```
(Repeat with the matching heading for Users, Policies, Metrics.)

- [ ] **Step 2: Document CORS note in README**

Add a section: if browser PUT uploads are blocked by CORS, set a bucket policy allowing the console origin, e.g.:
```bash
mc admin config set mw api cors_allow_origin="https://<console-host>"
mc admin service restart mw
```
(Presigned PUTs put auth in the query string, so a simple PUT usually avoids preflight; document this as the fix if a proxy/CDN forces preflight.)

- [ ] **Step 3: Full unit sweep**

Run: `npm test`
Expected: PASS — `config` (3), `session-crypto` (4), `errors` (4), `paths` (4).

- [ ] **Step 4: Type-check + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass (build compiles).

- [ ] **Step 5: Full e2e**

Run: `MW_TEST_ACCESS_KEY=mulanadmin MW_TEST_SECRET_KEY='<root-password>' npm run e2e`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/keys" "app/(app)/users" "app/(app)/policies" "app/(app)/metrics" README.md
git commit -m "feat: stub pages for keys/users/policies/metrics + CORS note"
```

---

## Deployment (after Phase 2 verified — optional follow-up, not a task here)

Build and run on coffee-server as a systemd service:
- `npm run build` (adapter-node output), copy repo to coffee-server (or build there)
- systemd unit runs `node` / `npm start` on `:3000` with env `MINIO_INTERNAL_ENDPOINT=http://127.0.0.1:9100`, `MINIO_PUBLIC_ENDPOINT=http://100.86.43.70:9100`, `SESSION_SECRET=<32+ random>`
- Reach the UI over Tailscale at `http://100.86.43.70:3000`

---

## Self-Review Notes

- **Spec coverage:** Phase 1 (config, session, login/logout, guard, shell) → Tasks 1–6. Phase 2 (bucket list/create/delete, object browser, presigned up/download, delete, new folder) → Tasks 7–11. Two-endpoint presigning → Tasks 4/9/10 (`publicClient`). Encrypted-cookie creds → Tasks 2–3. Error mapping → Task 4. Stubs so nav doesn't 404 → Task 12. Admin features (keys/users/policies/metrics) are explicitly deferred to later plans (Phases 3–5) per the spec's phasing.
- **Type consistency:** `Creds`, `internalClient`/`publicClient`, `listObjects` return shape, `prefixFromSegments`/`segmentsFromPrefix`/`breadcrumbs`/`displayName`, and action signatures are consistent across tasks.
- **No placeholders:** every code step contains complete code; e2e steps gate on `MW_TEST_*` env.
