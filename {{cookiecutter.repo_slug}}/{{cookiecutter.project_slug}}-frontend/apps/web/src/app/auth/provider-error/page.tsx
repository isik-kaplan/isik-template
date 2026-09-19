import { AuthCard, AuthCardFooterLink } from '@/components/app-auth/AuthCard'

import { sUseTranslation } from '@/i18n'

import type { TFunction } from 'i18next'

// Only two of allauth's error codes ever land here: `cancelled` (user declined provider consent)
// and everything else, folded into the pre-existing generic copy - the connect-flow-only codes
// (connected_other, reauthentication_required, permission_denied) can't reach this page, since
// ConnectionsList points its own callback_url straight back at /profile/connections instead (see
// its own comment) and surfaces those as a toast there.
function getCopy(error: string | undefined, t: TFunction) {
  if (error === 'cancelled') {
    return { title: t('auth:providerErrorCancelledTitle'), body: t('auth:providerErrorCancelledBody') }
  }
  return { title: t('auth:providerErrorTitle'), body: t('auth:providerErrorBody') }
}

export default async function ProviderErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_process?: string }>
}) {
  const { error, error_process: errorProcess } = await searchParams
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
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
