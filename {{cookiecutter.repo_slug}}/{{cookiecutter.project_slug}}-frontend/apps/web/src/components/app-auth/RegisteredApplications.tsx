'use client'

import { useState } from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'

import { type ApiType, detailOf } from '@{{ cookiecutter.repo_slug }}/api'

import { RegisterApplicationForm } from './RegisterApplicationForm'
import { toast } from 'sonner'

type Application = ApiType<'Application'>

export type RegisteredApplicationsProps = {
  initialApplications: Application[]
}

/** The client secret, in the one answer that carries it. */
function IssuedSecret({ application, onDone }: { application: Application; onDone: () => void }) {
  const { t } = useClientTranslation(['auth'])

  return (
    <div role="status" className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
      <p className="font-semibold">{t('auth:registerApplicationSecretTitle')}</p>
      <p className="text-muted-foreground">{t('auth:registerApplicationSecretHint')}</p>
      <dl className="flex flex-col gap-1">
        <dt className="text-muted-foreground">{t('auth:profileRegisteredApplicationsClientId')}</dt>
        <dd className="font-mono break-all">{application.client_id}</dd>
        <dt className="text-muted-foreground">{t('auth:registerApplicationSecretLabel')}</dt>
        <dd className="font-mono break-all">{application.client_secret}</dd>
      </dl>
      <Button variant="outline" size="sm" className="self-start" onClick={onDone}>
        {t('auth:registerApplicationSecretDone')}
      </Button>
    </div>
  )
}

/** The applications this person registered to offer "Sign in with" this project, and a way to add one. */
export function RegisteredApplications({ initialApplications }: RegisteredApplicationsProps) {
  const { t } = useClientTranslation(['auth'])
  const [applications, setApplications] = useState(initialApplications)
  const [issued, setIssued] = useState<Application | null>(null)
  const [pending, setPending] = useState<number | null>(null)

  async function remove(id: number) {
    setPending(id)
    const { error, response } = await createApi(apiOrigin()).deleteOAuthApplication(id)
    setPending(null)

    if (response.ok) {
      setApplications((current) => current.filter((application) => application.id !== id))
      toast.success(t('auth:profileRegisteredApplicationsDeleted'))
      return
    }

    toast.error(detailOf(error) ?? t('auth:profileRegisteredApplicationsDeleteError'))
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{t('auth:profileRegisteredApplicationsTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {t('auth:profileRegisteredApplicationsHint', { project: t('auth:appTitle') })}
      </p>
      {issued?.client_secret && <IssuedSecret application={issued} onDone={() => setIssued(null)} />}
      {applications.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('auth:profileRegisteredApplicationsEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {applications.map((application) => (
            <li key={application.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
                <span className="truncate font-medium">{application.name}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{application.client_id}</span>
                {application.redirect_uris.map((uri) => (
                  <span key={uri} className="truncate text-xs text-muted-foreground">
                    {uri}
                  </span>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={pending === application.id}
                onClick={() => remove(application.id)}
              >
                {t('auth:profileRegisteredApplicationsDeleteAction')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <RegisterApplicationForm
        onRegistered={(application) => {
          setApplications((current) => [application, ...current])
          setIssued(application)
        }}
      />
    </section>
  )
}
