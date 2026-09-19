import { headers } from 'next/headers'

import { EmailsList } from '@/components/app-auth/EmailsList'

import { isLocalDevHost } from '@/lib/isLocalDevHost'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { getRequestOrigin } from '@isikk/core/next/request'

export default async function ProfileEmailsPage() {
  // Gating already happened one level up, in profile/layout.tsx.
  const requestHeaders = await headers()
  const authOrigin = getRequestOrigin(requestHeaders, { isLocalDevHost }).replace('://', '://auth.')
  const authApi = new AuthApi(authOrigin, { cookieHeader: requestHeaders.get('cookie') ?? undefined })
  const { data } = await authApi.emails()

  return <EmailsList initialEmails={data?.data ?? []} />
}
