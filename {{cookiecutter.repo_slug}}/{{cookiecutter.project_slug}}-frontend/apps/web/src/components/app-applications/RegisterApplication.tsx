'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { useState } from 'react'

import { useClientTranslation } from '@/i18n/client'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { IssuedSecret } from './IssuedSecret'
import { RegisterApplicationForm } from './RegisterApplicationForm'
import type { Scope } from './ScopeChecklist'

type Application = ApiType<'Application'>

/** Registering one, and then the secret it was issued - shown here, once, before going on to it. */
export function RegisterApplication({ scopes }: { scopes: Scope[] }) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const [issued, setIssued] = useState<Application | null>(null)

  if (issued?.client_secret) {
    return (
      <div className="flex flex-col gap-4">
        <IssuedSecret clientId={issued.client_id} secret={issued.client_secret} />
        <Link href={`/applications/${issued.id}`} className="text-sm underline underline-offset-4">
          {t('auth:registerApplicationSecretDone')}
        </Link>
      </div>
    )
  }

  return (
    <RegisterApplicationForm
      scopes={scopes}
      // A public client has no secret to show, so there is nothing to stop for.
      onRegistered={(application) =>
        application.client_secret ? setIssued(application) : router.push(`/applications/${application.id}`)
      }
    />
  )
}
