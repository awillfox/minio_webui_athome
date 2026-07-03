# MinIO Web Console

A Next.js web console for MinIO — bucket browser, object browser with presigned upload/download, and an extensible shell for future admin features (access keys, users, policies, metrics).

> **Disclaimer:** This is an unofficial personal project. It is **not affiliated with, endorsed by, or sponsored by MinIO, Inc.** "MinIO" is a trademark of MinIO, Inc.; it is used here only to describe the object-storage server this tool talks to. All trademarks are the property of their respective owners.

## Running locally

Copy `.env.local.example` to `.env.local` and fill in:

```bash
MINIO_INTERNAL_ENDPOINT=http://127.0.0.1:9100   # server-side SDK calls
MINIO_PUBLIC_ENDPOINT=http://localhost:9100       # presigned URLs opened by the browser
SESSION_SECRET=<32+ random bytes, hex or base64>
```

Then:

```bash
npm install
npm run dev      # http://localhost:3000
```

Unit tests:

```bash
npm test
```

E2e tests (requires a running MinIO instance):

```bash
MW_TEST_ACCESS_KEY=<root-user> MW_TEST_SECRET_KEY=<root-password> npm run e2e
```

## Presigned uploads (CORS)

Presigned PUT URLs embed auth in the query string, so the browser performs a simple PUT with no preflight. MinIO's default configuration returns the necessary CORS headers for same-origin and typical local-dev origins, so **uploads work out of the box**.

If you later serve the console from a different origin and see the browser block the PUT, allow that origin with:

```bash
mc admin config set mw api cors_allow_origin="https://<console-host>"
mc admin service restart mw
```

## Admin features & `mc` runtime dependency

The Access Keys, Users, Policies, and Metrics pages shell out to the [MinIO Client (`mc`)](https://min.io/docs/minio/linux/reference/minio-mc.html) binary for admin operations. **`mc` must be on `PATH` on the host** — the console will fail at runtime for these pages if it is absent. On the deploy host, install it at `/usr/local/bin/mc`.

| Page | Description |
|------|-------------|
| **Access Keys** (`/keys`) | List, create, and delete service-account access keys for the current user |
| **Users** (`/users`) | List IAM users; create, delete, and attach/detach policies |
| **Policies** (`/policies`) | List and inspect IAM policy documents |
| **Metrics** (`/metrics`) | Server health, disk usage, and drive state from `mc admin info` |

## Architecture

```
Browser ──HTTPS──▶ Next.js (app router, adapter-node)
                     └─ Server Actions (requireSession guard)
                          └─▶ MinIO (internal endpoint) via S3 SDK / mc subprocess
                     └─ presigned URL redirect
                          └─▶ MinIO (public endpoint, browser direct)
```

- **Session**: encrypted httpOnly cookie (`SESSION_SECRET`). Credentials never touch the browser.
- **Two endpoints**: `MINIO_INTERNAL_ENDPOINT` for server-side SDK calls; `MINIO_PUBLIC_ENDPOINT` for presigned URLs the browser opens directly.
- **Phases 1–2 (complete)**: login, app shell, bucket browser, object browser with presigned upload/download, delete, new folder.
- **Phases 3–5 (complete)**: Access Keys, Users, Policies, Metrics — fully implemented via `mc` subprocess driver.
