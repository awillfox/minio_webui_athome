# MinIO Web Console — Design

**Date:** 2026-07-03
**Status:** Approved (design), pending implementation plan
**Project:** `minio-webui` (Next.js 16.2.10, React 19, Tailwind v4)

## Problem

The open-source MinIO server (`RELEASE.2025-09-07`) running on `coffee-server`
(`100.86.43.70:9100`) no longer ships the embedded web console UI — MinIO removed
it from the community binary in mid-2025. We need a self-hosted web console to
manage that MinIO instance: browse buckets/objects, manage access keys, users,
policies, and view metrics. Downgrading MinIO to a console-bundled release was
rejected (don't want to run an unpatched server).

## Goals

A web console covering the full MinIO admin surface:

1. Browse buckets & objects (list, upload, download, delete, create/delete buckets, new folder)
2. Access keys (service accounts): create / list / delete
3. Users & policies: manage MinIO users, groups, IAM policies
4. Metrics/monitoring: storage usage, drives, uptime, bucket sizes

## Non-goals

- Multi-server / multi-tenant management (single MinIO instance only)
- Replicating every niche MinIO console feature (bucket replication, ILM tiering,
  KMS config) in v1 — can be added later
- Running the app anywhere other than `coffee-server` for now

## Key decisions

### Deployment
Runs **on coffee-server** (`100.86.43.70`) as a systemd service on `:3000`,
alongside MinIO. Reached over Tailscale. Talks to MinIO over `127.0.0.1:9100`.

### Authentication
**Log in with MinIO credentials.** The user enters their MinIO access key +
secret key. The app uses *those* credentials, per session, for both the S3 API
and the admin API — so MinIO's own RBAC decides what each logged-in user can see
and do. Mirrors the behavior of the original MinIO console and the mulan-manager
httpOnly-cookie auth idiom.

- `/login` validates creds with one signed S3 `ListBuckets` call. Distinguish
  auth vs authz: `InvalidAccessKeyId` / `SignatureDoesNotMatch` → login failure;
  `AccessDenied` (or any 2xx) → success (valid creds, possibly limited permissions).
- On success, encrypt `{accessKey, secretKey}` with **AES-256-GCM** keyed by a
  `SESSION_SECRET` env var, store in an httpOnly + secure + sameSite cookie
  `mw_session`.
- `middleware.ts` guards the `(app)` route group; missing/invalid session →
  redirect `/login`. `/logout` clears the cookie.

**Tradeoff (accepted):** the secret key lives, encrypted, in the cookie. This is
stateless (survives restarts, no session store) and matches the mulan-manager
idiom. Acceptable because it is AES-GCM encrypted and access is tailnet-only.
Alternative — a server-side session store — was considered and rejected as
unnecessary for a single-node, tailnet-only deployment.

### MinIO communication — hybrid
Two mechanisms, each used where it is strongest:

- **S3 half** — `@aws-sdk/client-s3` for bucket/object listing and for generating
  **presigned URLs**. The browser uploads/downloads directly to MinIO over
  Tailscale using those URLs, so large files never pass through Next.
- **Admin half** — spawn the `mc` client (already installed on coffee-server)
  with `--json` for users, policies, access keys, and metrics. This avoids
  reimplementing MinIO's admin-API SigV4 signing *and* its DARE response
  encryption (which `madmin` handles) in JavaScript.

### Two endpoints (important)
SigV4 signs the `Host` header, so a presigned URL must be signed against the host
the browser will actually contact.

- `MINIO_INTERNAL_ENDPOINT=http://127.0.0.1:9100` — server-side listing/signing
- `MINIO_PUBLIC_ENDPOINT=http://100.86.43.70:9100` — used to generate presigned
  URLs the browser follows

## Architecture

```
Browser ──(Tailscale, same-origin)──▶ minio-webui (Next 16, systemd :3000)
   │                                     ├─ S3 half:  @aws-sdk/client-s3 ──▶ MinIO 127.0.0.1:9100
   │                                     └─ Admin half: spawn `mc … --json` ─▶ MinIO 127.0.0.1:9100
   └── direct PUT/GET via presigned URL ──────────────────────────────────────▶ MinIO 100.86.43.70:9100
```

## Code structure (isolated units)

| Unit | Responsibility | Depends on |
|---|---|---|
| `lib/config.ts` | read + validate env (endpoints, session secret) | env |
| `lib/session.ts` | AES-256-GCM encrypt/decrypt creds; cookie read/write; `getSession()` | `config` |
| `lib/s3.ts` | build S3 client from session; list buckets/objects (delimiter `/`), presign GET/PUT, create/delete bucket, delete object(s), head object | `session`, `@aws-sdk/client-s3` |
| `lib/mc.ts` | spawn `mc` via `execFile` (no shell) with per-spawn `MC_HOST_mw` env; parse `--json` (one object per line); surface `{status:"error"}` | `session` |
| `lib/admin/info.ts` | `mc admin info` → storage/drives/uptime/usage | `mc` |
| `lib/admin/keys.ts` | `mc admin user svcacct` add/ls/rm/info | `mc` |
| `lib/admin/users.ts` | `mc admin user` add/ls/rm/enable/disable | `mc` |
| `lib/admin/policies.ts` | `mc admin policy` list/info/create/attach/detach | `mc` |
| `lib/errors.ts` | central error mapping (SDK + mc → user-facing) | — |
| `app/(app)/…` | pages + Server Actions | libs |

**`mc` invocation contract:** per spawn, set env
`MC_HOST_mw=http://<urlenc-accessKey>:<urlenc-secretKey>@127.0.0.1:9100`, invoke
`mc <cmd> mw [args] --json` with args passed as an argv array via `execFile`
(never string-interpolated, no shell) to prevent injection. No global `mc` config
file is written, so concurrent requests don't clash.

## Pages

- `/login` — access key + secret key form
- `(app)` layout — sidebar nav (Buckets, Access Keys, Users, Policies, Metrics) +
  header showing endpoint + logout
- `(app)/buckets` — bucket list; create; delete
- `(app)/buckets/[bucket]/[[...prefix]]` — object browser: breadcrumb, folders
  (CommonPrefixes) + objects, upload (presigned PUT, drag/drop or picker),
  download (presigned GET), delete, new folder (zero-byte `prefix/` object),
  pagination via continuation token
- `(app)/keys` — service accounts: list, create (secret shown once), delete
- `(app)/users` — users: list, create, enable/disable, delete, attach policy
- `(app)/policies` — policies: list, view JSON, create, attach/detach
- `(app)/metrics` — dashboard: storage used/free, drives OK, uptime, bucket count/sizes

**Data flow:** Server Components read via `lib/*` (server-side, session creds).
Mutations via Server Actions. Presigned URLs handed to client components for
direct browser transfer with progress. Client components only where interactive
(upload progress, modals, confirm dialogs).

## Error handling

- SDK auth errors (`InvalidAccessKeyId`, `SignatureDoesNotMatch`) → clear session,
  redirect `/login`
- `AccessDenied` → non-fatal "Not permitted" toast; page still renders what is allowed
- `mc` `{status:"error", error:{message}}` → surface `message`
- Empty states for no buckets / empty prefix / no users etc.

## Testing

- **Vitest unit:** session encrypt/decrypt round-trip; `mc` `--json` line parsing
  (incl. error objects); S3 error → user-message mapping; presign endpoint
  selection (public vs internal host).
- **Playwright e2e** against live MinIO on coffee-server (creds via env, guarded
  like mulan-manager's live-backend tests): login → create bucket → upload →
  download → delete object → delete bucket → create + delete access key.

## Next.js 16 note

Next 16.2.10 has breaking changes vs. prior knowledge (per the project's
`AGENTS.md`). Before writing any code, read the relevant guides in
`node_modules/next/dist/docs/` — specifically async `cookies()`/`headers()`,
Server Actions, `middleware.ts`, and route-handler/`[[...slug]]` conventions.

## Phasing (each phase independently shippable)

1. **Foundation** — `lib/config`, `lib/session`, `/login`, `/logout`,
   `middleware.ts`, `(app)` shell/layout
2. **Object browser** — `lib/s3`, buckets page, object browser, presigned
   upload/download, delete, new folder
3. **Access keys** — `lib/mc`, `lib/admin/keys`, keys page
4. **Users & policies** — `lib/admin/users`, `lib/admin/policies`, pages
5. **Metrics dashboard** — `lib/admin/info`, metrics page

First implementation plan targets **Phases 1–2** — a working, logged-in file
browser — then subsequent plans add phases 3–5.

## Deployment (post-build)

systemd service on coffee-server running `node` (Next standalone or `next start`),
`:3000`, env: `MINIO_INTERNAL_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT`, `SESSION_SECRET`.
Reached over Tailscale. `mc` must be on `PATH` (already installed at
`/usr/local/bin/mc`).
