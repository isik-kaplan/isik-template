import { notFound } from 'next/navigation'

import { ApplicationStatusBadge } from '@/components/app-applications/ApplicationStatusBadge'
import { ApprovalPanel } from '@/components/app-applications/ApprovalPanel'
import { PageShell } from '@/components/app/PageShell'

import { sUseTranslation } from '@/i18n'
import { mayReviewApplications } from '@/lib/access'
import { approvalLabel } from '@/lib/applicationApproval'
import { DEVICE_GRANT, grantLabel } from '@/lib/applicationGrant'
import { describedScopes, scopeLabel } from '@/lib/oauthScopes'
import { serverApi } from '@/lib/serverApi'

/** One application under review: whose it is, where it signs people in to, and what it asks for. */
export default async function ApplicationReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const api = await serverApi()
  const [{ data: me }, { data: application }, { data: scopes }] = await Promise.all([
    api.me(),
    api.oauthApplicationReview(Number(id)),
    api.delegatableScopes(),
  ])
  if (!me || !application || !mayReviewApplications(me)) notFound()
  const { t } = await sUseTranslation(['auth'])
  const offered = scopes ?? []
  const described = describedScopes(offered)
  const listed = (names: string[]) =>
    names.length === 0
      ? t('auth:applicationNoScopes')
      : names.map((scope) => scopeLabel(scope, t, described)).join(' · ')

  return (
    <PageShell
      title={application.name}
      description={application.description}
      backHref="/staff/applications"
      backLabel={t('auth:applicationReviewsBack')}
    >
      <section className="flex flex-col gap-2 text-sm">
        <ApplicationStatusBadge approval={application.approval} label={approvalLabel(application.approval, t)} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">{t('auth:applicationReviewsOwnerLabel')}</dt>
          <dd>{application.owner}</dd>
          <dt className="text-muted-foreground">{t('auth:applicationClientId')}</dt>
          <dd className="font-mono break-all">{application.client_id}</dd>
          <dt className="text-muted-foreground">{t('auth:registerApplicationGrantLabel')}</dt>
          <dd>{grantLabel(application.authorization_grant_type, t)}</dd>
          {application.authorization_grant_type !== DEVICE_GRANT && (
            <>
              <dt className="text-muted-foreground">{t('auth:registerApplicationRedirectUrisLabel')}</dt>
              <dd className="break-all">{application.redirect_uris.join(' · ')}</dd>
            </>
          )}
          <dt className="text-muted-foreground">{t('auth:applicationRequestedScopesLabel')}</dt>
          <dd>{listed(application.requested_scopes)}</dd>
          <dt className="text-muted-foreground">{t('auth:applicationApprovedScopes')}</dt>
          <dd>{listed(application.approved_scopes)}</dd>
        </dl>
      </section>
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <ApprovalPanel application={application} scopes={offered} />
      </section>
    </PageShell>
  )
}
