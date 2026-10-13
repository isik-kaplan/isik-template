import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ApplicationStatusBadge } from '@/components/app-applications/ApplicationStatusBadge'
import { ResourceFilters } from '@/components/app/Filters/ResourceFilters'
import { type Asked, filtersFor } from '@/components/app/Filters/filterSpec'
import { pagedQueryFrom } from '@/components/app/Filters/paging'
import { PageShell } from '@/components/app/PageShell'
import { ResourcePaginator } from '@/components/app/ResourcePaginator'

import { sUseTranslation } from '@/i18n'
import { mayReviewApplications } from '@/lib/access'
import { approvalLabel } from '@/lib/applicationApproval'
import { serverApi } from '@/lib/serverApi'

import type { ApiQuery } from '@{{ cookiecutter.repo_slug }}/api'

type ReviewQuery = NonNullable<ApiQuery<'/v0/oauth-application-reviews/'>>

/** Every application, waiting ones first, for the superusers who approve and withdraw them. */
export default async function ApplicationReviewsPage({ searchParams }: { searchParams: Promise<Asked> }) {
  const api = await serverApi()
  const { data: me } = await api.me()
  if (!me || !mayReviewApplications(me)) notFound()
  const { t } = await sUseTranslation(['auth'])
  const specs = [
    filtersFor<ReviewQuery>().on({
      name: 'approval',
      label: t('auth:applicationReviewsFilter'),
      anyLabel: t('auth:applicationReviewsFilterAny'),
      options: (['pending', 'approved', 'disabled', 'withdrawn'] as const).map((approval) => ({
        value: approval,
        label: approvalLabel(approval, t),
      })),
    }),
  ]
  const asked = await searchParams
  const { data } = await api.oauthApplicationReviews(pagedQueryFrom(specs, asked))
  const applications = data?.results ?? []
  // Awaited rather than nested as an element: an async element only renders under a server renderer.
  const paginator = await ResourcePaginator({ specs, asked, totalPages: data?.total_pages ?? 0 })

  return (
    <PageShell
      title={t('auth:applicationReviewsTitle')}
      description={t('auth:applicationReviewsHint')}
      backHref="/"
      backLabel={t('auth:backToHome')}
    >
      <ResourceFilters specs={specs} />
      {applications.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('auth:applicationReviewsEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {applications.map((application) => (
            <li key={application.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <Link
                href={`/staff/applications/${application.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {application.name}
              </Link>
              <ApplicationStatusBadge approval={application.approval} label={approvalLabel(application.approval, t)} />
              <span className="text-sm text-muted-foreground">
                {t('auth:applicationReviewsOwner', { owner: application.owner })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {paginator}
    </PageShell>
  )
}
