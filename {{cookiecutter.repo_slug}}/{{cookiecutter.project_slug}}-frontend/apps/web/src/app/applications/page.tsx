import Link from 'next/link'

import { ApplicationStatusBadge } from '@/components/app-applications/ApplicationStatusBadge'
import { PageShell } from '@/components/app/PageShell'
import { Button } from '@/components/base/button'

import { sUseTranslation } from '@/i18n'
import { approvalLabel } from '@/lib/applicationApproval'
import { serverApi } from '@/lib/serverApi'

/** The applications the signed-in person registered so their users can sign in with this project. */
export default async function ApplicationsPage() {
  const { t } = await sUseTranslation(['auth'])
  const { data } = await (await serverApi()).oauthApplications()
  const applications = data?.results ?? []

  return (
    <PageShell
      title={t('auth:applicationsTitle')}
      description={t('auth:applicationsHint', { project: t('auth:appTitle') })}
      backHref="/"
      backLabel={t('auth:backToHome')}
    >
      <Button className="self-start" render={<Link href="/applications/new" />}>
        {t('auth:applicationsRegister')}
      </Button>
      {applications.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('auth:applicationsEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {applications.map((application) => (
            <li key={application.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <Link href={`/applications/${application.id}`} className="font-medium underline-offset-4 hover:underline">
                {application.name}
              </Link>
              <ApplicationStatusBadge approval={application.approval} label={approvalLabel(application.approval, t)} />
              <span className="w-full truncate font-mono text-xs text-muted-foreground">{application.client_id}</span>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  )
}
