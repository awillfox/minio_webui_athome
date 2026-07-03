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
