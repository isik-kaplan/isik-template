import { headers } from 'next/headers'

import { SessionsList } from '@/components/app-auth/SessionsList'

import { isLocalDevHost } from '@/lib/isLocalDevHost'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { getRequestOrigin } from '@isikk/core/next/request'

export default async function ProfileSessionsPage() {
  // Gating already happened one level up, in profile/layout.tsx.
  const requestHeaders = await headers()
  const authOrigin = getRequestOrigin(requestHeaders, { isLocalDevHost }).replace('://', '://auth.')
  const authApi = new AuthApi(authOrigin, { cookieHeader: requestHeaders.get('cookie') ?? undefined })
  const { data } = await authApi.sessions()

  return <SessionsList initialSessions={data?.data ?? []} />
}
