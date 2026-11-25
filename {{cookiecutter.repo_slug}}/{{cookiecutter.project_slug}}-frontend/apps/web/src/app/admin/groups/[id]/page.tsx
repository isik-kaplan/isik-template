import { notFound } from 'next/navigation'

import { GroupForm } from '@/components/app-admin/GroupForm'
import { PageShell } from '@/components/app/PageShell'

import { sUseTranslation } from '@/i18n'
import { mayChangeGroups, maySeePeople } from '@/lib/access'
import { permissionLabels } from '@/lib/permissionLabels'
import { serverApi } from '@/lib/serverApi'

import { etagOf } from '@{{ cookiecutter.repo_slug }}/api'

/** One group: what it gives, changed by whoever may grant it. */
export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const api = await serverApi()
  const [{ data: me }, { data: group, response }, { data: permissions }] = await Promise.all([
    api.me(),
    api.group(id),
    api.permissions(),
  ])
  if (!me || !group || !maySeePeople(me)) notFound()
  const { t } = await sUseTranslation(['auth'])
  const etag = etagOf(response)

  return (
    <PageShell title={group.name} backHref="/groups" backLabel={t('auth:groupsBack')}>
      {/* Keyed on the version, so a refresh after somebody else's save shows theirs, not its own. */}
      {mayChangeGroups(me) ? (
        <GroupForm key={etag} group={group} etag={etag} permissions={permissions ?? []} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {permissionLabels(group.permissions, permissions).join(' · ') || t('auth:groupGivesNothing')}
        </p>
      )}
    </PageShell>
  )
}
