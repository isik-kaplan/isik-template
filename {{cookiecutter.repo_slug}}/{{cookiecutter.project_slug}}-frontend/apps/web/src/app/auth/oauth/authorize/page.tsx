import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { AuthCard } from '@/components/app-auth/AuthCard'
import { AutoFormButton } from '@/components/app-auth/AutoFormButton'

import { sUseTranslation } from '@/i18n'
import { OAUTH_AUTHORIZE_PATH } from '@/lib/afterSignIn'
import { scopeLabel } from '@/lib/oauthScopes'
import { requestOrigin } from '@/lib/requestOrigin'

// What the backend's consent form takes back, each echoed unchanged - see its AuthorizationView, which
// is what sends the browser here with them.
const CONSENT_FIELDS = [
  'client_id',
  'redirect_uri',
  'response_type',
  'scope',
  'state',
  'nonce',
  'code_challenge',
  'code_challenge_method',
  'claims',
  'resource',
] as const

type ConsentParams = Partial<Record<(typeof CONSENT_FIELDS)[number] | 'application_name', string | string[]>>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** An application asking to sign somebody in with this project. The answer is a real form post back to
 *  the authorize endpoint, which decides everything - this page only words the question. */
export default async function OAuthAuthorizePage({ searchParams }: { searchParams: Promise<ConsentParams> }) {
  const params = await searchParams
  const application = first(params.application_name)
  if (!application || !first(params.client_id)) notFound()

  const fields: Record<string, string> = {}
  for (const name of CONSENT_FIELDS) {
    const value = first(params[name])
    if (value) fields[name] = value
  }
  const { t } = await sUseTranslation(['auth'])
  const action = `${requestOrigin(await headers()).replace('://', '://auth.')}${OAUTH_AUTHORIZE_PATH}`
  const scopes = (fields.scope ?? '').split(' ').filter(Boolean)
  // DOT reads any value of `allow` as yes and its absence as no.
  const allowed = { ...fields, allow: 'Authorize' }

  return (
    <AuthCard
      title={t('auth:oauthConsentTitle', { application })}
      description={t('auth:oauthConsentIntro', { application, project: t('auth:appTitle') })}
    >
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        {scopes.map((scope) => (
          <li key={scope}>{scopeLabel(scope, t)}</li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <AutoFormButton action={action} payload={allowed}>
          {t('auth:oauthConsentAllow')}
        </AutoFormButton>
        <AutoFormButton variant="outline" action={action} payload={fields}>
          {t('auth:oauthConsentDeny')}
        </AutoFormButton>
      </div>
      <p className="text-center text-sm text-muted-foreground">{t('auth:oauthConsentFootnote')}</p>
    </AuthCard>
  )
}
