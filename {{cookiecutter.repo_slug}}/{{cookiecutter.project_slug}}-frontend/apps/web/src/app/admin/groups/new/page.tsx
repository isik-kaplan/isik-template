import { notFound } from 'next/navigation'

import { GroupForm } from '@/components/app-admin/GroupForm'
import { PageShell } from '@/components/app/PageShell'

import { sUseTranslation } from '@/i18n'
import { mayChangeGroups } from '@/lib/access'
import { serverApi } from '@/lib/serverApi'

/** A new group, for whoever may grant what it would give. */
export default async function NewGroupPage() {
  const api = await serverApi()
  const [{ data: me }, { data: permissions }] = await Promise.all([api.me(), api.permissions()])
  if (!me || !mayChangeGroups(me)) notFound()
  const { t } = await sUseTranslation(['auth'])

  return (
    <PageShell title={t('auth:groupNew')} backHref="/groups" backLabel={t('auth:groupsBack')}>
      <GroupForm permissions={permissions ?? []} />
    </PageShell>
  )
}
