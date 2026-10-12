'use client'

import { useMemo } from 'react'
import type React from 'react'

import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { useValidatedFormState } from '@/lib/submit'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { z } from 'zod'

const FIELD_CLASS =
  'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

export function RegisterApplicationForm({
  onRegistered,
}: {
  onRegistered: (application: ApiType<'Application'>) => void
}) {
  const { t } = useClientTranslation(['auth'])
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('auth:validationApplicationNameRequired')),
        client_type: z.enum(['confidential', 'public']),
        // One per line, as typed; the backend says which of them it cannot return to.
        redirect_uris: z
          .string()
          .transform((value) =>
            value
              .split('\n')
              .map((uri) => uri.trim())
              .filter(Boolean)
          )
          .pipe(z.array(z.string()).min(1, t('auth:validationRedirectUrisRequired'))),
      }),
    [t]
  )
  const { formState, formErrors, handleFormStateEvent, isSubmitting, submit, resetFormState } = useValidatedFormState(
    schema,
    { name: '', client_type: 'confidential' as 'confidential' | 'public', redirect_uris: '' }
  )

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    await submit(
      (application, idempotencyKey) => createApi(apiOrigin()).registerOAuthApplication(application, idempotencyKey),
      {
        failure: t('auth:registerApplicationError'),
        onSuccess: ({ data }) => {
          onRegistered(data!)
          resetFormState()
        },
      }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 border-t border-border pt-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="application_name">{t('auth:registerApplicationNameLabel')}</Label>
        <Input
          id="application_name"
          name="name"
          value={formState.name}
          onChange={handleFormStateEvent('name')}
          errorText={formErrors?.name?.[0]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="application_client_type">{t('auth:registerApplicationTypeLabel')}</Label>
        <select
          id="application_client_type"
          name="client_type"
          className={FIELD_CLASS}
          value={formState.client_type}
          onChange={handleFormStateEvent('client_type')}
        >
          <option value="confidential">{t('auth:registerApplicationTypeConfidential')}</option>
          <option value="public">{t('auth:registerApplicationTypePublic')}</option>
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="application_redirect_uris">{t('auth:registerApplicationRedirectUrisLabel')}</Label>
        <textarea
          id="application_redirect_uris"
          name="redirect_uris"
          rows={2}
          className={FIELD_CLASS}
          aria-invalid={formErrors?.redirect_uris ? true : undefined}
          value={formState.redirect_uris}
          onChange={handleFormStateEvent('redirect_uris')}
        />
        {formErrors?.redirect_uris && <p className="text-sm text-destructive">{formErrors.redirect_uris[0]}</p>}
      </div>
      {formErrors?.non_field_errors && <p className="text-sm text-destructive">{formErrors.non_field_errors[0]}</p>}
      <Button type="submit" className="self-start" disabled={isSubmitting}>
        {t('auth:registerApplicationSubmit')}
      </Button>
    </form>
  )
}
