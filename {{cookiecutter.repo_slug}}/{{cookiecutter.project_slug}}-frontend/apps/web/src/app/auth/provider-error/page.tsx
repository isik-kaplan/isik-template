import { AuthCard, AuthCardFooterLink } from '@/components/app-auth/AuthCard'

import { sUseTranslation } from '@/i18n'
import type { Translate } from '@/i18n/config'

// Only two of allauth's error codes ever land here: `cancelled` (user declined provider consent)
// and everything else, folded into the pre-existing generic copy - plus the backend's own
// `logins_closed`, a social sign-in the login policy turned away. The connect-flow-only codes
// (connected_other, reauthentication_required, permission_denied) can't reach this page, since
// ConnectionsList points its own callback_url straight back at /profile/connections instead (see
// its own comment) and surfaces those as a toast there.
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
  // error_process is only ever 'connect' here on the rare fallback where allauth lost track of
  // the connect flow's own next_url mid-request (state/CSRF mismatch) and fell back to this page's
  // global socialaccount_login_error URL instead - point the link back at where the user actually
  // came from rather than always assuming the login/signup flow.
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
