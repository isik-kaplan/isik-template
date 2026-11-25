'use client'

import { useRouter } from 'next/navigation'

import type React from 'react'
import { useState } from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { useAPISubmit } from '@/lib/submit'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { useIdempotencyKey } from '@isikk/core/hooks'
import { toast } from 'sonner'

type Policy = ApiType<'SiteSettingsLoginPolicy'>

const LADDER: Policy[] = ['everyone', 'staff', 'superusers']

/** Who may sign in. Raising it signs out everybody it no longer admits; only a superuser may choose the top rung. */
export function SiteSettingsForm({
  settings,
  etag,
  isSuperuser,
}: {
  settings: ApiType<'SiteSettings'>
  // The read's ETag header: the version this form was opened on.
  etag: string | null
  isSuperuser: boolean
}) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const { isSubmitting, submit } = useAPISubmit()
  const saving = useIdempotencyKey()
  const [policy, setPolicy] = useState<Policy>(settings.login_policy ?? 'everyone')
  const [mail, setMail] = useState(false)
  // Spelled out because i18next-parser only finds a literal key.
  const labels: Record<Policy, string> = {
    everyone: t('auth:settingsPolicyEveryone'),
    staff: t('auth:settingsPolicyStaff'),
    superusers: t('auth:settingsPolicySuperusers'),
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const changes = { login_policy: policy, mail_the_people_signed_out: mail }
    await submit(
      (headers) => createApi(apiOrigin()).updateSiteSettings(changes, { ...headers, ...saving.headerFor(changes) }),
      {
        failure: t('auth:settingsSaveError'),
        etag,
        onStale: () => router.refresh(),
        // Said here rather than as `success`: how many it signed out is only known from the answer.
        onSuccess: ({ data }) => {
          toast.success(t('auth:settingsSaved', { count: data.signed_out ?? 0 }))
          saving.used()
          router.refresh()
        },
      }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t('auth:settingsPolicyLegend')}</legend>
        {LADDER.map((rung) => (
          <label key={rung} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="login_policy"
              value={rung}
              checked={policy === rung}
              disabled={rung === 'superusers' && !isSuperuser}
              onChange={() => setPolicy(rung)}
            />
            {labels[rung]}
          </label>
        ))}
        <p className="text-sm text-muted-foreground">{t('auth:settingsPolicyHint')}</p>
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={mail} onChange={(event) => setMail(event.target.checked)} />
        <span className="flex flex-col">
          <span>{t('auth:settingsMailLabel')}</span>
          <span className="text-muted-foreground">{t('auth:settingsMailHint')}</span>
        </span>
      </label>
      <Button type="submit" className="self-start" disabled={isSubmitting}>
        {t('auth:settingsSave')}
      </Button>
    </form>
  )
}
