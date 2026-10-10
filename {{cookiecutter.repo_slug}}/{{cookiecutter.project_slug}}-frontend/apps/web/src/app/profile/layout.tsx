import type React from 'react'

import { SessionWatcher } from '@/components/app/SessionWatcher'

import { requireSession } from '@/lib/getSession'

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  await requireSession()
  return (
    <main className="flex w-full flex-1 items-center justify-center p-6">
      <SessionWatcher />
      {children}
    </main>
  )
}
