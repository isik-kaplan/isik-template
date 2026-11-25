import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import type React from 'react'

import { AdminNav } from '@/components/app-admin/AdminNav'
import { SessionWatcher } from '@/components/app/SessionWatcher'

import { sUseTranslation } from '@/i18n'
import { adminSections } from '@/lib/adminSections'
import { requireSession } from '@/lib/getSession'
import { siblingOrigin } from '@/lib/hosts'
import { requestOrigin } from '@/lib/requestOrigin'
import { serverApi } from '@/lib/serverApi'

/** admin.<domain>, for whoever has a part of it to see; anybody else finds nothing here. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSession()
  const { data: me } = await (await serverApi()).me()
  const sections = me ? adminSections(me) : []
  if (sections.length === 0) notFound()
  const { t } = await sUseTranslation(['auth'])
  const app = { href: siblingOrigin(requestOrigin(await headers()), null), label: t('auth:adminBackToApp') }

  return (
    <>
      <SessionWatcher />
      <AdminNav
        label={t('auth:adminNavLabel')}
        sections={sections.map((section) => ({ href: section.href, label: t(section.labelKey) }))}
        app={app}
      />
      {children}
    </>
  )
}
