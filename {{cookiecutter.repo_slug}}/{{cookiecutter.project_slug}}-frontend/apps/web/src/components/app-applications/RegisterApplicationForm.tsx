'use client'

import { useMemo } from 'react'
import type React from 'react'

import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { DEVICE_GRANT, type Grant, grantLabel } from '@/lib/applicationGrant'
import { redirectUrisFrom } from '@/lib/redirectUris'
import { useValidatedFormState } from '@/lib/submit'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { type Scope, ScopeChecklist } from './ScopeChecklist'
import { FIELD_CLASS } from './fieldClass'
import { z } from 'zod'

export function RegisterApplicationForm({
  scopes,
  onRegistered,
}: {
  scopes: Scope[]
  onRegistered: (application: ApiType<'Application'>) => void
}) {
  const { t } = useClientTranslation(['auth'])
  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().trim().min(1, t('auth:validationApplicationNameRequired')),
          description: z.string().trim(),
          authorization_grant_type: z.enum(['authorization-code', DEVICE_GRANT]),
          client_type: z.enum(['confidential', 'public']),
          redirect_uris: z.string().transform(redirectUrisFrom),
          requested_scopes: z.array(z.string()),
        })
        .superRefine((application, context) => {
          if (application.authorization_grant_type !== DEVICE_GRANT && application.redirect_uris.length === 0) {
            context.addIssue({
              code: 'custom',
              path: ['redirect_uris'],
              message: t('auth:validationRedirectUrisRequired'),
            })
          }
        })
        // A device keeps no secret and is sent back nowhere, whatever the hidden fields last held.
        .transform((application) =>
          application.authorization_grant_type === DEVICE_GRANT
            ? { ...application, client_type: 'public' as const, redirect_uris: [] }
            : application
        ),
    [t]
  )
  const { formState, formErrors, handleFormStateEvent, handleFormStateValue, isSubmitting, submit } =
    useValidatedFormState(schema, {
      name: '',
      description: '',
      authorization_grant_type: 'authorization-code' as Grant,
      client_type: 'confidential' as 'confidential' | 'public',
      redirect_uris: '',
      requested_scopes: [] as string[],
    })
  const device = formState.authorization_grant_type === DEVICE_GRANT

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    await submit(
      (application, idempotencyKey) => createApi(apiOrigin()).registerOAuthApplication(application, idempotencyKey),
      { failure: t('auth:registerApplicationError'), onSuccess: ({ data }) => onRegistered(data) }
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
      <div className="flex flex-col gap-2">
        <Label htmlFor="application_grant">{t('auth:registerApplicationGrantLabel')}</Label>
        <select
          id="application_grant"
          name="authorization_grant_type"
          className={FIELD_CLASS}
          value={formState.authorization_grant_type}
          onChange={handleFormStateEvent('authorization_grant_type')}
        >
          <option value="authorization-code">{grantLabel('authorization-code', t)}</option>
          <option value={DEVICE_GRANT}>{grantLabel(DEVICE_GRANT, t)}</option>
        </select>
        {device && <p className="text-sm text-muted-foreground">{t('auth:registerApplicationDeviceHint')}</p>}
      </div>
      {!device && (
        <>
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
        </>
      )}
      <ScopeChecklist
        legend={t('auth:applicationRequestedScopesLabel')}
        scopes={scopes}
        value={formState.requested_scopes}
        onChange={handleFormStateValue('requested_scopes')}
      />
      {formErrors?.non_field_errors && <p className="text-sm text-destructive">{formErrors.non_field_errors[0]}</p>}
      <Button type="submit" className="self-start" disabled={isSubmitting}>
        {t('auth:registerApplicationSubmit')}
      </Button>
    </form>
  )
}
