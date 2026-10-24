'use client'

import { useRouter } from 'next/navigation'

import { useMemo } from 'react'
import type React from 'react'

import { ConflictNotice } from '@/components/app/ConflictNotice'
import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { DEVICE_GRANT } from '@/lib/applicationGrant'
import { redirectUrisFrom } from '@/lib/redirectUris'
import { useVersionedFormState } from '@/lib/submit'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { type Scope, ScopeChecklist } from './ScopeChecklist'
import { FIELD_CLASS } from './fieldClass'
import { z } from 'zod'

/** An application as this form holds it: its redirect URIs one to a line. */
function asForm(application: ApiType<'Application'>) {
  return {
    name: application.name,
    description: application.description ?? '',
    redirect_uris: (application.redirect_uris ?? []).join('\n'),
    requested_scopes: application.requested_scopes ?? [],
  }
}

/** Editing an application. Changing its redirect URIs or asking for more needs its owner to prove it is them. */
export function EditApplicationForm({
  application,
  etag,
  scopes,
}: {
  application: ApiType<'Application'>
  // The read's ETag header: the version this form was opened on.
  etag: string | null
  scopes: Scope[]
}) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  // A device is sent back nowhere, so it has no redirect URIs to edit - and none are sent.
  const device = application.authorization_grant_type === DEVICE_GRANT
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('auth:validationApplicationNameRequired')),
        description: z.string().trim(),
        redirect_uris: device
          ? z.string().transform((): undefined => undefined)
          : z
              .string()
              .transform(redirectUrisFrom)
              .pipe(z.array(z.string()).min(1, t('auth:validationRedirectUrisRequired'))),
        requested_scopes: z.array(z.string()),
      }),
    [t, device]
  )
  const {
    formState,
    formErrors,
    handleFormStateEvent,
    handleFormStateValue,
    isSubmitting,
    submit,
    conflict,
    takeTheirs,
    keepMine,
  } = useVersionedFormState(schema, asForm(application), {
    // A save names the version it was opened on, so somebody else's save is not overwritten.
    etag,
    fromServer: (current) => asForm(current as ApiType<'Application'>),
  })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    await submit(
      (changes, headers) => createApi(apiOrigin()).updateOAuthApplication(application.id, changes, headers),
      {
        success: t('auth:applicationSaved'),
        failure: t('auth:applicationSaveError'),
        onSuccess: () => router.refresh(),
      }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
        <Label htmlFor="application_description">{t('auth:applicationDescriptionLabel')}</Label>
        <textarea
          id="application_description"
          name="description"
          rows={2}
          className={FIELD_CLASS}
          value={formState.description}
          onChange={handleFormStateEvent('description')}
        />
      </div>
      {!device && (
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
      )}
      <ScopeChecklist
        legend={t('auth:applicationRequestedScopesLabel')}
        scopes={scopes}
        value={formState.requested_scopes}
        onChange={handleFormStateValue('requested_scopes')}
      />
      {formErrors?.non_field_errors && <p className="text-sm text-destructive">{formErrors.non_field_errors[0]}</p>}
      <ConflictNotice conflict={conflict} takeTheirs={takeTheirs} keepMine={keepMine} disabled={isSubmitting} />
      <Button type="submit" className="self-start" disabled={isSubmitting}>
        {t('auth:applicationSave')}
      </Button>
    </form>
  )
}
