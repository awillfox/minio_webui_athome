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
