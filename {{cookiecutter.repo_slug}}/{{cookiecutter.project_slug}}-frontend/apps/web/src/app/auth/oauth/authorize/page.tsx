import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { AuthCard } from '@/components/app-auth/AuthCard'
import { AutoFormButton } from '@/components/app-auth/AutoFormButton'
import { ConsentSignOut } from '@/components/app-auth/ConsentSignOut'

import { sUseTranslation } from '@/i18n'
import { OAUTH_AUTHORIZE_PATH } from '@/lib/afterSignIn'
import { getSession } from '@/lib/getSession'
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

type ConsentParams = Partial<
  Record<
    (typeof CONSENT_FIELDS)[number] | 'application_name' | 'application_description' | 'scopes_descriptions',
    string | string[]
  >
>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** The backend's wording of each requested scope, in request order, keyed by the scope. Anything that is not
 *  that list words nothing, so the page falls back to the scope itself. */
function descriptionsOf(scopes: string[], raw: string | undefined): Record<string, string> {
  let descriptions: unknown = null
  try {
    descriptions = JSON.parse(String(raw))
  } catch {
    // Absent or not JSON at all, which words nothing either.
  }
  if (!Array.isArray(descriptions)) return {}
  return Object.fromEntries(scopes.map((scope, index) => [scope, String(descriptions[index] ?? scope)]))
}

/** An application asking to sign somebody in with this project, and perhaps to act for them. The answer is
 *  a real form post back to the authorize endpoint, which decides everything - this page only words the
 *  question. */
export default async function OAuthAuthorizePage({ searchParams }: { searchParams: Promise<ConsentParams> }) {
  const params = await searchParams
  const session = await getSession()
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
  const described = descriptionsOf(scopes, first(params.scopes_descriptions))
  const description = first(params.application_description)
  // DOT reads any value of `allow` as yes and its absence as no.
  const allowed = { ...fields, allow: 'Authorize' }
  // Where whoever signs in next is asked the same question again.
  const authorizeUrl = `${action}?${new URLSearchParams(fields).toString()}`

  return (
    <AuthCard
      title={t('auth:oauthConsentTitle', { application })}
      description={t('auth:oauthConsentIntro', { application, project: t('auth:appTitle') })}
    >
      {description && <p className="text-sm">{description}</p>}
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        {scopes.map((scope) => (
          <li key={scope}>{scopeLabel(scope, t, described)}</li>
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
      {session && <ConsentSignOut username={session.user.username} authorizeUrl={authorizeUrl} />}
    </AuthCard>
  )
}
