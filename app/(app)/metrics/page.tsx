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
