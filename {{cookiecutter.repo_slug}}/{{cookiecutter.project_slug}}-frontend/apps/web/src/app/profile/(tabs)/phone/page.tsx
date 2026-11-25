import { headers } from 'next/headers'

import { PhoneSection } from '@/components/app-auth/PhoneSection'

import { siblingOrigin } from '@/lib/hosts'
import { requestOrigin } from '@/lib/requestOrigin'
import { visitorFetch } from '@/lib/visitor'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

export default async function ProfilePhonePage() {
  // Gating already happened one level up, in profile/layout.tsx.
  const requestHeaders = await headers()
  const authOrigin = siblingOrigin(requestOrigin(requestHeaders), 'auth')
  const authApi = new AuthApi(authOrigin, {
    cookieHeader: requestHeaders.get('cookie') ?? undefined,
    baseFetch: visitorFetch(requestHeaders),
  })
  const { data } = await authApi.phone()

  return <PhoneSection initialPhone={data?.data[0] ?? null} />
}
