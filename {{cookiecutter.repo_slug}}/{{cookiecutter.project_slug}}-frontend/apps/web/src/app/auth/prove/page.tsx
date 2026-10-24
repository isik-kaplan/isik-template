import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { AuthCard, AuthCardFooterLink } from '@/components/app-auth/AuthCard'
import { ProveContent } from '@/components/app-auth/ProveContent'

import { sUseTranslation } from '@/i18n'
import { requireSession } from '@/lib/getSession'
import { provePath, safeNext } from '@/lib/reauthentication'
import { requestOrigin } from '@/lib/requestOrigin'
import { visitorFetch } from '@/lib/visitor'

import { Api } from '@{{ cookiecutter.repo_slug }}/api'
import { PROVIDER_REAUTHENTICATE_PATH } from '@{{ cookiecutter.repo_slug }}/auth-api'

// Where a refused act sends somebody to prove it is them; a provider round trip returns here first.
export default async function ProvePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; proved?: string; error?: string }>
}) {
  const { next: requested, proved, error } = await searchParams
  const next = safeNext(requested)
  await requireSession(`/auth/login?next=${encodeURIComponent(provePath(next))}`)
  if (proved === '1') redirect(next)

  const requestHeaders = await headers()
  const origin = requestOrigin(requestHeaders)
  const api = new Api(origin.replace('://', '://api.'), {
    cookieHeader: requestHeaders.get('cookie') ?? undefined,
    baseFetch: visitorFetch(requestHeaders),
  })
  const { data: flows } = await api.reauthenticationFlows()
  const { t } = await sUseTranslation(['auth'])

  return (
    <AuthCard
      title={t('auth:proveTitle')}
      description={t('auth:proveDescription')}
      footer={
        <AuthCardFooterLink href={next} className="block text-center">
          {t('auth:proveCancelLink')}
        </AuthCardFooterLink>
      }
    >
      <ProveContent
        flows={flows ?? []}
        next={next}
        error={error}
        providerAction={`${origin.replace('://', '://auth.')}${PROVIDER_REAUTHENTICATE_PATH}`}
        callbackUrl={`${origin}${provePath(next)}`}
      />
    </AuthCard>
  )
}
