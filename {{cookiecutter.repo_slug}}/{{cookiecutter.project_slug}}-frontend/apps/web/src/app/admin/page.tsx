import { notFound, redirect } from 'next/navigation'

import { adminSections } from '@/lib/adminSections'
import { serverApi } from '@/lib/serverApi'

/** The admin opens on the first part of it its visitor may see. */
export default async function AdminHomePage() {
  const { data: me } = await (await serverApi()).me()
  const first = me ? adminSections(me)[0] : undefined
  if (!first) notFound()
  redirect(first.href)
}
