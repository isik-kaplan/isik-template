'use client'

import { useRouter } from 'next/navigation'

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

export function ProvePasswordForm({ next }: { next: string }) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const schema = useMemo(() => z.object({ password: z.string().min(1, t('auth:validationPasswordRequired')) }), [t])
  const { formState, formErrors, handleFormStateEvent, isSubmitting, submit } = useAuthValidatedFormState(schema, {
    password: '',
  })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    await submit(({ password }) => createAuthApi(authOrigin()).reauthenticate(password), {
      failure: t('auth:provePasswordError'),
      leavesOnSuccess: true,
      onSuccess: () => router.replace(next),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t('auth:provePasswordLabel')}</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          value={formState.password}
          onChange={handleFormStateEvent('password')}
        />
        {formErrors?.password && <p className="text-destructive text-sm">{formErrors.password[0]}</p>}
      </div>
      {formErrors?.non_field_errors && <p className="text-destructive text-sm">{formErrors.non_field_errors[0]}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {t('auth:provePasswordSubmit')}
      </Button>
    </form>
  )
}
