'use client'

import { useRouter } from 'next/navigation'

import { useMemo } from 'react'
import type React from 'react'

import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'

import { useClientTranslation } from '@/i18n'
import { authOrigin } from '@/lib/authOrigin'
import { useValidatedFormState } from '@/lib/useValidatedFormState'

import { AuthApi, extractAuthErrors } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { PasswordInput } from './PasswordInput'
import { z } from 'zod'

export type CompleteSignupFormProps = {
  // Always the verified address the provider itself supplied - never user-editable here, and
  // never even sent as-typed: the backend's own pending-sociallogin state is the source of truth
  // for the email regardless of what this form submits, so a fixed display value is all this needs.
  email: string
  suggestedUsername?: string
}

export function CompleteSignupForm({ email, suggestedUsername = '' }: CompleteSignupFormProps) {
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const schema = useMemo(
    () =>
      z.object({
        username: z.string().min(1, t('auth:validationUsernameRequired')),
        password: z.string().min(8, t('auth:validationPasswordMinLength')),
      }),
    // Stryker disable next-line ArrayDeclaration: equivalent mutant. t's reference never
    // changes across renders in this single-language app, so this memo never actually
    // recomputes either way.
    [t]
  )
  const { formState, formErrors, handleFormStateEvent, isSubmitting, submit } = useValidatedFormState(schema, {
    username: suggestedUsername,
    password: '',
  })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const authApi = new AuthApi(authOrigin())
    await submit(() => authApi.completeProviderSignup({ ...formState, email }), {
      // Same 401-can-mean-success shape as every other auth endpoint here (see VerifyEmailButton) -
      // mandatory email verification means the account can be created without becoming logged in.
      isSuccess: ({ data, error }) => Boolean(data) || !extractAuthErrors(error)?.length,
      // Stryker disable next-line StringLiteral: equivalent mutant, unreachable rather than
      // untested - useApiSubmit only falls back to this string when toFormErrors(error) is
      // undefined, which by isSuccess above already means this call counted as a success.
      failure: t('auth:completeSignupError'),
      onSuccess: ({ response }) => router.push(response.status === 200 ? '/' : '/auth/login'),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{t('auth:completeSignupBody', { email })}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">{t('auth:completeSignupUsernameLabel')}</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          value={formState.username}
          onChange={handleFormStateEvent('username')}
        />
        {formErrors?.username && <p className="text-destructive text-sm">{formErrors.username[0]}</p>}
      </div>
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
