import type React from 'react'

import { SessionWatcher } from '@/components/app/SessionWatcher'

import { requireSession } from '@/lib/getSession'

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  await requireSession()
  return (
    <>
      <SessionWatcher />
      {children}
    </>
  )
}
