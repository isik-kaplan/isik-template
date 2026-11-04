'use client'

import { useRouter } from 'next/navigation'

import { useMemo } from 'react'
import type React from 'react'

import { Button } from '@/components/base/button'
import { Label } from '@/components/base/label'

import { useClientTranslation } from '@/i18n/client'
import { authOrigin } from '@/lib/authOrigin'
import { offeredNames } from '@/lib/names'
import { useAuthValidatedFormState } from '@/lib/submit'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { NameFields, nameSchema, shownNames } from './NameFields'
import { PasswordInput } from './PasswordInput'
import { detailOf } from '@isikk/core/allauth'
import { z } from 'zod'

export type CompleteSignupFormProps = {
  // Display only: the backend's pending sociallogin owns the email, whatever this form sends.
  email: string
  suggestedUsername?: string
}

export function CompleteSignupForm({ email, suggestedUsername = '' }: CompleteSignupFormProps) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const shown = offeredNames()
  const schema = useMemo(
    () =>
      z.object({
        ...nameSchema(t),
        password: z.string().min(8, t('auth:validationPasswordMinLength')),
      }),
    [t]
  )
  const { formState, formErrors, handleFormStateEvent, isSubmitting, submit } = useAuthValidatedFormState(schema, {
    first_name: '',
    last_name: '',
    username: suggestedUsername,
    password: '',
  })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const authApi = new AuthApi(authOrigin())
    await submit(
      (value) => authApi.completeProviderSignup({ email, password: value.password, ...shownNames(value, shown) }),
      {
        // A 401 can mean success: mandatory verification creates the account without logging in.
        isSuccess: ({ data, error }) => Boolean(data) || detailOf(error) === undefined,
        failure: t('auth:completeSignupError'),
        leavesOnSuccess: true,
        onSuccess: ({ response }) => router.push(response.status === 200 ? '/' : '/auth/login'),
      }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{t('auth:completeSignupBody', { email })}</p>
      <NameFields shown={shown} values={formState} errors={formErrors} onChange={handleFormStateEvent} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t('auth:completeSignupPasswordLabel')}</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          value={formState.password}
          onChange={handleFormStateEvent('password')}
        />
        {formErrors?.password && <p className="text-destructive text-sm">{formErrors.password[0]}</p>}
      </div>
      {formErrors?.non_field_errors && <p className="text-destructive text-sm">{formErrors.non_field_errors[0]}</p>}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {t('auth:completeSignupSubmit')}
      </Button>
    </form>
  )
}
