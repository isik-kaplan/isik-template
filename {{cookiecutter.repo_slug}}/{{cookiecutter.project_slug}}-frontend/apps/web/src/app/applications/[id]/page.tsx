import { notFound } from 'next/navigation'

import { ApplicationLifecycle } from '@/components/app-applications/ApplicationLifecycle'
import { ApplicationStatusBadge } from '@/components/app-applications/ApplicationStatusBadge'
import { EditApplicationForm } from '@/components/app-applications/EditApplicationForm'
import { RotateSecretPanel } from '@/components/app-applications/RotateSecretPanel'
import { PageShell } from '@/components/app/PageShell'

import { sUseTranslation } from '@/i18n'
import { approvalLabel } from '@/lib/applicationApproval'
import { grantLabel } from '@/lib/applicationGrant'
import { describedScopes, scopeLabel } from '@/lib/oauthScopes'
import { serverApi } from '@/lib/serverApi'

/** One application its owner registered: how it signs people in, what it may do, and its lifecycle. */
export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const api = await serverApi()
  const [{ data: application }, { data: scopes }] = await Promise.all([
    api.oauthApplication(Number(id)),
    api.delegatableScopes(),
  ])
  if (!application) notFound()
  const { t } = await sUseTranslation(['auth'])
  const offered = scopes ?? []
  const described = describedScopes(offered)
  const waiting = (application.requested_scopes ?? []).filter((scope) => !application.approved_scopes.includes(scope))

  return (
    <PageShell
      title={application.name}
      description={application.description}
      backHref="/applications"
      backLabel={t('auth:applicationsBack')}
    >
      <section className="flex flex-col gap-2 text-sm">
        <ApplicationStatusBadge approval={application.approval} label={approvalLabel(application.approval, t)} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">{t('auth:applicationClientId')}</dt>
          <dd className="font-mono break-all">{application.client_id}</dd>
          <dt className="text-muted-foreground">{t('auth:registerApplicationGrantLabel')}</dt>
          {/* Always answered, though the API document cannot say so of a field a request may leave out. */}
          <dd>{grantLabel(application.authorization_grant_type ?? 'authorization-code', t)}</dd>
          <dt className="text-muted-foreground">{t('auth:applicationApprovedScopes')}</dt>
          <dd>
            {application.approved_scopes.length === 0
              ? t('auth:applicationNoScopes')
              : application.approved_scopes.map((scope) => scopeLabel(scope, t, described)).join(' · ')}
          </dd>
        </dl>
        {waiting.length > 0 && (
          <p className="text-muted-foreground">
            {t('auth:applicationWaitingScopes', {
              scopes: waiting.map((scope) => scopeLabel(scope, t, described)).join(' · '),
            })}
          </p>
        )}
      </section>
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-sm font-semibold">{t('auth:applicationSettingsTitle')}</h2>
        <EditApplicationForm application={application} scopes={offered} />
      </section>
      {application.client_type === 'confidential' && (
        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <h2 className="text-sm font-semibold">{t('auth:applicationSecretTitle')}</h2>
          <RotateSecretPanel applicationId={application.id} clientId={application.client_id} />
        </section>
      )}
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-sm font-semibold">{t('auth:applicationLifecycleTitle')}</h2>
        <ApplicationLifecycle application={application} />
      </section>
    </PageShell>
  )
}
