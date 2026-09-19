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

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { PasswordInput } from './PasswordInput'
import { z } from 'zod'

export function LoginForm({ redirectTo = '/' }: { redirectTo?: string }) {
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const schema = useMemo(
    () =>
      z.object({
        login: z.string().min(1, t('auth:validationLoginRequired')),
        password: z.string().min(1, t('auth:validationPasswordRequired')),
      }),
    // Stryker disable next-line ArrayDeclaration: equivalent mutant. t's reference never
    // changes across renders in this single-language app, so this memo never actually
    // recomputes either way.
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
        // A 409 means the visitor was already logged in - also a success, not a refusal.
        isSuccess: ({ data, response }) => Boolean(data) || response.status === 409,
        failure: t('auth:loginError'),
        onSuccess: () => {
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
