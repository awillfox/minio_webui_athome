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
