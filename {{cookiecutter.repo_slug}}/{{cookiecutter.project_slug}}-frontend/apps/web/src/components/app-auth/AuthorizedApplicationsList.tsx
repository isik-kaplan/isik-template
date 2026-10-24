'use client'

import { useState } from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { scopeLabel } from '@/lib/oauthScopes'

import { type ApiType, detailOf } from '@{{ cookiecutter.repo_slug }}/api'

import { useIdempotencyKey } from '@isikk/core/hooks'
import { toast } from 'sonner'

export type AuthorizedApplicationsListProps = {
  initialApplications: ApiType<'AuthorizedApplication'>[]
  // The backend's wording of the permissions an application may act with - see scopeLabel.
  described?: Record<string, string>
}

/** The applications this person let into their account, and a way to shut each one out again. */
export function AuthorizedApplicationsList({ initialApplications, described = {} }: AuthorizedApplicationsListProps) {
  const { t } = useClientTranslation(['auth'])
  const [applications, setApplications] = useState(initialApplications)
  const [pending, setPending] = useState<number | null>(null)
  // Keyed by which one, so a retry after a lost answer is the same revoke rather than a second.
  const revoking = useIdempotencyKey()

  async function revoke(id: number) {
    setPending(id)
    const { error, response } = await createApi(apiOrigin()).revokeAuthorizedApplication(id, revoking.keyFor(id))
    setPending(null)

    if (response.ok) {
      revoking.used()
      setApplications((current) => current.filter((application) => application.id !== id))
      toast.success(t('auth:profileAuthorizedApplicationsRevoked'))
      return
    }

    toast.error(detailOf(error) ?? t('auth:profileAuthorizedApplicationsRevokeError'))
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{t('auth:profileAuthorizedApplicationsTitle')}</h3>
      {applications.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('auth:profileAuthorizedApplicationsEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {applications.map((application) => (
            <li key={application.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
                <span className="truncate font-medium">{application.name}</span>
                <span className="text-sm text-muted-foreground">
                  {application.scopes.map((scope) => scopeLabel(scope, t, described)).join(' · ')}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {t('auth:profileAuthorizedApplicationsSince', {
                    date: new Date(application.granted_at).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    }),
                  })}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={pending === application.id}
                onClick={() => revoke(application.id)}
              >
                {t('auth:profileAuthorizedApplicationsRevokeAction')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
