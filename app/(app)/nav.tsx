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
