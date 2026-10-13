import { notFound } from 'next/navigation'

import type React from 'react'

import { SessionWatcher } from '@/components/app/SessionWatcher'

import { applicationsAreOn } from '@/lib/access'
import { requireSession } from '@/lib/getSession'

export default async function ApplicationsLayout({ children }: { children: React.ReactNode }) {
  if (!applicationsAreOn()) notFound()
  await requireSession()
  return (
    <>
      <SessionWatcher />
      {children}
    </>
  )
}
