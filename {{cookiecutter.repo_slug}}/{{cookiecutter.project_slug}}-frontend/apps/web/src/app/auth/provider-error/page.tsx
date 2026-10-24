import { AuthCard, AuthCardFooterLink } from '@/components/app-auth/AuthCard'

import { sUseTranslation } from '@/i18n'
import type { Translate } from '@/i18n/config'

// `cancelled`, the backend's `logins_closed`, and the generic rest. Connect-flow codes go back to
// /profile/connections instead.
function getCopy(error: string | undefined, t: Translate) {
  if (error === 'cancelled') {
    return { title: t('auth:providerErrorCancelledTitle'), body: t('auth:providerErrorCancelledBody') }
  }
  if (error === 'logins_closed') {
    return { title: t('auth:providerErrorLoginsClosedTitle'), body: t('auth:providerErrorLoginsClosedBody') }
  }
  return { title: t('auth:providerErrorTitle'), body: t('auth:providerErrorBody') }
}

export default async function ProviderErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_process?: string }>
}) {
  const { error, error_process: errorProcess } = await searchParams
  const { t } = await sUseTranslation(['auth'])
  const { title, body } = getCopy(error, t)
  // 'connect' only when allauth lost the connect flow's next_url and fell back to this page.
  const isConnect = errorProcess === 'connect'

  return (
    <AuthCard
      title={title}
      footer={
        <AuthCardFooterLink href={isConnect ? '/profile/connections' : '/auth/login'} className="block text-center">
          {isConnect ? t('auth:backToConnectionsLink') : t('auth:backToLoginLink')}
        </AuthCardFooterLink>
      }
    >
      <p className="text-muted-foreground text-sm">{body}</p>
    </AuthCard>
  )
}
