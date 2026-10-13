import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AuthorizedApplicationsList } from '@/components/app-auth/AuthorizedApplicationsList'

import { sUseTranslation } from '@/i18n'
import { applicationsAreOn } from '@/lib/access'
import { describedScopes } from '@/lib/oauthScopes'
import { serverApi } from '@/lib/serverApi'

export default async function ProfileApplicationsPage() {
  if (!applicationsAreOn()) notFound()
  const api = await serverApi()
  const [authorized, scopes] = await Promise.all([api.authorizedApplications(), api.delegatableScopes()])
  const { t } = await sUseTranslation(['auth'])

  return (
    <div className="flex flex-col gap-6">
      <AuthorizedApplicationsList
        initialApplications={authorized.data ?? []}
        described={describedScopes(scopes.data ?? [])}
      />
      <p className="border-t border-border pt-6 text-sm text-muted-foreground">
        {t('auth:profileApplicationsRegisterHint')}{' '}
        <Link href="/applications" className="text-primary underline underline-offset-4">
          {t('auth:profileApplicationsRegisterLink')}
        </Link>
      </p>
    </div>
  )
}
