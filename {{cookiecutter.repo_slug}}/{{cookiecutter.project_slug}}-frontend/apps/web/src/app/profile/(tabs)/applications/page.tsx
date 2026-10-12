import { notFound } from 'next/navigation'

import { AuthorizedApplicationsList } from '@/components/app-auth/AuthorizedApplicationsList'
import { RegisteredApplications } from '@/components/app-auth/RegisteredApplications'

import { CONFIG } from '@/config/public'
import { serverApi } from '@/lib/serverApi'

export default async function ProfileApplicationsPage() {
  if (CONFIG.OAUTH_PROVIDER.MODE === 'off') notFound()
  const api = await serverApi()
  const [authorized, registered] = await Promise.all([api.authorizedApplications(), api.oauthApplications()])

  return (
    <div className="flex flex-col gap-8">
      <AuthorizedApplicationsList initialApplications={authorized.data ?? []} />
      {/* Refused for somebody the provider's mode does not let register - see the backend's registration.py. */}
      {registered.data && <RegisteredApplications initialApplications={registered.data.results} />}
    </div>
  )
}
