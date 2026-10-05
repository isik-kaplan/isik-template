'use client'

import { useRouter } from 'next/navigation'

import { useMemo } from 'react'
import type React from 'react'

import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'

import { useClientTranslation } from '@/i18n/client'
import { authOrigin } from '@/lib/authOrigin'
import { VERIFY_EMAIL_REQUIRED_PATH } from '@/lib/sessionChannel'
import { useValidatedFormState } from '@/lib/useValidatedFormState'

import { AuthApi, hasPendingVerifyEmail, pendingMfaTypes } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { PasswordInput } from './PasswordInput'
import { z } from 'zod'

export function LoginForm({ redirectTo = '/' }: { redirectTo?: string }) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const schema = useMemo(
    () =>
      z.object({
        login: z.string().min(1, t('auth:validationLoginRequired')),
        password: z.string().min(1, t('auth:validationPasswordRequired')),
      }),
    [t]
  )
  const { formState, formErrors, handleFormStateEvent, isSubmitting, submit } = useValidatedFormState(schema, {
    login: '',
    password: '',
  })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const authApi = new AuthApi(authOrigin())
    const isEmail = formState.login.includes('@')
    await submit(
      () =>
        authApi.login({
          ...(isEmail ? { email: formState.login } : { username: formState.login }),
          password: formState.password,
        }),
      {
        // None of these is a wrong password: a 409 means the visitor was already logged in, a pending
        // verify_email flow means the address is still unconfirmed, and a pending second factor is owed.
        isSuccess: ({ data, error, response }) =>
          Boolean(data) || response.status === 409 || hasPendingVerifyEmail(error) || pendingMfaTypes(error) !== null,
        failure: t('auth:loginError'),
        onSuccess: ({ error }) => {
          if (hasPendingVerifyEmail(error)) {
            router.push(VERIFY_EMAIL_REQUIRED_PATH)
            return
          }
          if (pendingMfaTypes(error) !== null) {
            router.push(`/auth/two-factor?next=${encodeURIComponent(redirectTo)}`)
            return
          }
          router.push(redirectTo)
          router.refresh()
        },
      }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="login">{t('auth:loginIdentifierLabel')}</Label>
        <Input
          id="login"
          name="login"
          autoComplete="username"
          value={formState.login}
          onChange={handleFormStateEvent('login')}
        />
        {formErrors?.login && <p className="text-destructive text-sm">{formErrors.login[0]}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t('auth:loginPasswordLabel')}</Label>
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
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {t('auth:loginSubmit')}
      </Button>
    </form>
  )
}
