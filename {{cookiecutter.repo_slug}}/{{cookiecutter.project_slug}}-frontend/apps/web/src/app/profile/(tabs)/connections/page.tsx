import { headers } from 'next/headers'

import { ConnectionsList } from '@/components/app-auth/ConnectionsList'

import { requestOrigin } from '@/lib/requestOrigin'
import { visitorFetch } from '@/lib/visitor'

import { AuthApi, PROVIDER_REDIRECT_PATH } from '@{{ cookiecutter.repo_slug }}/auth-api'

export default async function ProfileConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  // Gating already happened one level up, in profile/layout.tsx.
  const requestHeaders = await headers()
  const origin = requestOrigin(requestHeaders)
  const authOrigin = origin.replace('://', '://auth.')
  const authApi = new AuthApi(authOrigin, {
    cookieHeader: requestHeaders.get('cookie') ?? undefined,
    baseFetch: visitorFetch(requestHeaders),
  })
  const { data: providers } = await authApi.providers()
  // The connect flow's callback_url points back here, so a failed connect arrives as `error`.
  const { error } = await searchParams

  return (
    <ConnectionsList
      initialProviders={providers?.data ?? []}
      connectAction={`${authOrigin}${PROVIDER_REDIRECT_PATH}`}
      callbackUrl={`${origin}/profile/connections`}
      connectError={Array.isArray(error) ? error[0] : error}
    />
  )
}
