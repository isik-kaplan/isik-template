import { notFound } from 'next/navigation'

import { ManageUserForm } from '@/components/app-people/ManageUserForm'
import { PageShell } from '@/components/app/PageShell'

import { sUseTranslation } from '@/i18n'
import { maySeePeople } from '@/lib/access'
import { personLabel } from '@/lib/names'
import { serverApi } from '@/lib/serverApi'

import { etagOf } from '@{{ cookiecutter.repo_slug }}/api'

// Enough for a picker; a deployment with more groups than this wants a search here instead.
const GROUPS_SHOWN = 100

/** One account, and - for whoever manages accounts - what they may do. */
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const api = await serverApi()
  const [{ data: me }, { data: person, response }, { data: permissions }, { data: groups }] = await Promise.all([
    api.me(),
    api.user(id),
    api.permissions(),
    api.groups({ page_size: GROUPS_SHOWN }),
  ])
  if (!me || !person || !maySeePeople(me)) notFound()
  const { t } = await sUseTranslation(['auth'])
  const etag = etagOf(response)
  const manages = me.permissions.includes('users:manage:user') && person.id !== me.id

  return (
    <PageShell
      title={personLabel(person)}
      description={person.email}
      backHref="/people"
      backLabel={t('auth:peopleBack')}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t('auth:peopleTermsVersion')}</dt>
        <dd className="font-mono break-all">{person.terms_version || t('auth:peopleTermsNone')}</dd>
        <dt className="text-muted-foreground">{t('auth:peopleTermsAcceptedAt')}</dt>
        <dd>{person.terms_accepted_at ?? t('auth:peopleTermsNone')}</dd>
      </dl>
      {/* The form keyed on the version, so a refresh after somebody else's save shows theirs, not its own. */}
      {manages ? (
        <ManageUserForm
          key={etag}
          user={person}
          etag={etag}
          permissions={permissions ?? []}
          groups={(groups?.results ?? []).map((group) => ({ id: group.id, name: group.name }))}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {person.id === me.id ? t('auth:peopleYourself') : t('auth:peopleReadOnly')}
        </p>
      )}
    </PageShell>
  )
}
