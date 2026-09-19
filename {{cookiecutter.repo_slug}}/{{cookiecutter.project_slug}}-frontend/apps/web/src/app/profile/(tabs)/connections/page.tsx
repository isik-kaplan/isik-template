import { headers } from 'next/headers'

import { ConnectionsList } from '@/components/app-auth/ConnectionsList'

import { isLocalDevHost } from '@/lib/isLocalDevHost'

import { AuthApi, PROVIDER_REDIRECT_PATH } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { getRequestOrigin } from '@isikk/core/next/request'

export default async function ProfileConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  // Gating already happened one level up, in profile/layout.tsx.
  const requestHeaders = await headers()
  const origin = getRequestOrigin(requestHeaders, { isLocalDevHost })
  const authOrigin = origin.replace('://', '://auth.')
  const authApi = new AuthApi(authOrigin, {
    cookieHeader: requestHeaders.get('cookie') ?? undefined,
  })
  const { data: providers } = await authApi.providers()
  // The connect flow's own callback_url below points straight back at this page, not at
  // /auth/callback-complete or /auth/provider-error, so a failed connect attempt (already linked
  // to another user, session not fresh enough, etc.) surfaces its `error` code here - see
  // ConnectionsList's own comment for how it's turned into an inline banner.
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
