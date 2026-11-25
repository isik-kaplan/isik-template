import { headers } from 'next/headers'

import { SessionsList } from '@/components/app-auth/SessionsList'

import { siblingOrigin } from '@/lib/hosts'
import { requestOrigin } from '@/lib/requestOrigin'
import { visitorFetch } from '@/lib/visitor'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

export default async function ProfileSessionsPage() {
  // Gating already happened one level up, in profile/layout.tsx.
  const requestHeaders = await headers()
  const authOrigin = siblingOrigin(requestOrigin(requestHeaders), 'auth')
  const authApi = new AuthApi(authOrigin, {
    cookieHeader: requestHeaders.get('cookie') ?? undefined,
    baseFetch: visitorFetch(requestHeaders),
  })
  const { data } = await authApi.sessions()

  return <SessionsList initialSessions={data?.data ?? []} />
}
