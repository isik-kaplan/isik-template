import { notFound } from 'next/navigation'

import { ManageUserForm } from '@/components/app-people/ManageUserForm'
import { PageShell } from '@/components/app/PageShell'

import { sUseTranslation } from '@/i18n'
import { maySeePeople } from '@/lib/access'
import { serverApi } from '@/lib/serverApi'

import { etagOf } from '@{{ cookiecutter.repo_slug }}/api'

/** One account, and - for whoever manages accounts - what they may do. */
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const api = await serverApi()
  const [{ data: me }, { data: person, response }, { data: permissions }] = await Promise.all([
    api.me(),
    api.user(id),
    api.permissions(),
  ])
  if (!me || !person || !maySeePeople(me)) notFound()
  const { t } = await sUseTranslation(['auth'])
  const etag = etagOf(response)
  const manages = me.permissions.includes('users:manage:user') && person.id !== me.id

  return (
    <PageShell
      title={person.username}
      description={person.email}
      backHref="/staff/people"
      backLabel={t('auth:peopleBack')}
    >
      {/* The form keyed on the version, so a refresh after somebody else's save shows theirs, not its own. */}
      {manages ? (
        <ManageUserForm key={etag} user={person} etag={etag} permissions={permissions ?? []} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {person.id === me.id ? t('auth:peopleYourself') : t('auth:peopleReadOnly')}
        </p>
      )}
    </PageShell>
  )
}
