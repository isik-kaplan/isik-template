'use client'

import { useMemo } from 'react'
import type React from 'react'

import { Button } from '@/components/base/button'
import { Label } from '@/components/base/label'

import { useClientTranslation } from '@/i18n/client'
import { createAuthApi } from '@/lib/apiClients'
import { authOrigin } from '@/lib/authOrigin'
import { useAuthValidatedFormState } from '@/lib/submit'

import { PasswordInput } from './PasswordInput'
import { z } from 'zod'

export function ChangePasswordForm() {
  const { t } = useClientTranslation(['auth'])
  // Keyed exactly like allauth's ChangePasswordInput ("current_password"/"new_password"), not
  // camelCase - toFormErrors groups server-side errors by that literal API param, and a form-only
  // key naming scheme would silently desync from it (client-side Zod errors would still show up
  // fine under a mismatched key; only the server-side ones would go missing).
  const schema = useMemo(
    () =>
      z.object({
        current_password: z.string().min(1, t('auth:validationPasswordRequired')),
        new_password: z.string().min(8, t('auth:validationPasswordMinLength')),
      }),
    [t]
  )
  const { formState, formErrors, handleFormStateEvent, setFormState, isSubmitting, submit } = useAuthValidatedFormState(
    schema,
    { current_password: '', new_password: '' }
  )

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    await submit((value) => createAuthApi(authOrigin()).changePassword(value), {
      success: t('auth:changePasswordSuccess'),
      failure: t('auth:changePasswordError'),
      onSuccess: () => setFormState({ current_password: '', new_password: '' }),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="current_password">{t('auth:changePasswordCurrentLabel')}</Label>
        <PasswordInput
          id="current_password"
          name="current_password"
          autoComplete="current-password"
          value={formState.current_password}
          onChange={handleFormStateEvent('current_password')}
        />
        {formErrors?.current_password && <p className="text-destructive text-sm">{formErrors.current_password[0]}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="new_password">{t('auth:changePasswordNewLabel')}</Label>
        <PasswordInput
          id="new_password"
          name="new_password"
          autoComplete="new-password"
          value={formState.new_password}
          onChange={handleFormStateEvent('new_password')}
        />
        {formErrors?.new_password && <p className="text-destructive text-sm">{formErrors.new_password[0]}</p>}
      </div>
      {formErrors?.non_field_errors && <p className="text-destructive text-sm">{formErrors.non_field_errors[0]}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {t('auth:changePasswordSubmit')}
      </Button>
    </form>
  )
}
