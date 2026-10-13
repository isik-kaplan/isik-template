import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ResourceFilters } from '@/components/app/Filters/ResourceFilters'
import { type Asked, filtersFor } from '@/components/app/Filters/filterSpec'
import { pagedQueryFrom } from '@/components/app/Filters/paging'
import { PageShell } from '@/components/app/PageShell'
import { ResourcePaginator } from '@/components/app/ResourcePaginator'
import { Badge } from '@/components/base/badge'

import { sUseTranslation } from '@/i18n'
import { maySeePeople } from '@/lib/access'
import { serverApi } from '@/lib/serverApi'

import type { ApiQuery } from '@{{ cookiecutter.repo_slug }}/api'

type PeopleQuery = NonNullable<ApiQuery<'/v0/users/'>>

/** Everybody's account, for whoever reads them all - staff, and holders of `users:manage:user`. */
export default async function PeoplePage({ searchParams }: { searchParams: Promise<Asked> }) {
  const api = await serverApi()
  const { data: me } = await api.me()
  if (!me || !maySeePeople(me)) notFound()
  const { t } = await sUseTranslation(['auth'])
  const specs = [
    filtersFor<PeopleQuery>().boolean({
      name: 'is_active',
      label: t('auth:peopleActiveFilter'),
      anyLabel: t('auth:peopleFilterAny'),
      yes: t('auth:peopleActive'),
      no: t('auth:peopleInactive'),
    }),
    filtersFor<PeopleQuery>().boolean({
      name: 'is_staff',
      label: t('auth:peopleStaffFilter'),
      anyLabel: t('auth:peopleFilterAny'),
      yes: t('auth:peopleStaff'),
      no: t('auth:peopleNotStaff'),
    }),
  ]
  const asked = await searchParams
  const { data } = await api.users(pagedQueryFrom(specs, asked))
  const people = data?.results ?? []
  // Awaited rather than nested as an element: an async element only renders under a server renderer.
  const paginator = await ResourcePaginator({ specs, asked, totalPages: data?.total_pages ?? 0 })

  return (
    <PageShell title={t('auth:peopleTitle')} backHref="/" backLabel={t('auth:backToHome')}>
      <ResourceFilters specs={specs} />
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('auth:peopleEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {people.map((person) => (
            <li key={person.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <Link href={`/staff/people/${person.id}`} className="font-medium underline-offset-4 hover:underline">
                {person.username}
              </Link>
              <span className="text-sm text-muted-foreground">{person.email}</span>
              {person.is_superuser && <Badge>{t('auth:peopleSuperuser')}</Badge>}
              {person.is_staff && <Badge variant="secondary">{t('auth:peopleStaff')}</Badge>}
              {!person.is_active && <Badge variant="outline">{t('auth:peopleInactive')}</Badge>}
            </li>
          ))}
        </ul>
      )}
      {paginator}
    </PageShell>
  )
}
