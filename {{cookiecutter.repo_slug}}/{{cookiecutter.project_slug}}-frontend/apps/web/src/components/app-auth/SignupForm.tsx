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

export function SignupForm() {
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const schema = useMemo(
    () =>
      z.object({
        username: z.string().min(1, t('auth:validationUsernameRequired')),
        email: z.email(t('auth:validationEmailInvalid')),
        password: z.string().min(8, t('auth:validationPasswordMinLength')),
      }),
    // Stryker disable next-line ArrayDeclaration: equivalent mutant. t's reference never
    // changes across renders in this single-language app, so this memo never actually
    // recomputes either way.
    [t]
  )
  const { formState, formErrors, handleFormStateEvent, isSubmitting, submit } = useValidatedFormState(schema, {
    username: '',
    email: '',
    password: '',
  })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const authApi = new AuthApi(authOrigin())
    await submit(() => authApi.signup(formState), {
      // Mandatory email verification: a successful signup is still a 401, with a pending
      // verify_email flow, not a 2xx - it means "go check your inbox", not "you're in".
      isSuccess: ({ data, error, response }) => {
        if (data) return true
        if (response.status !== 401) return false
        // Stryker disable next-line OptionalChaining: equivalent mutant. `error` is only ever
        // undefined when `data` is set instead (openapi-fetch's discriminated result), and the
        // early return above already covers that case.
        const errorData = error?.data
        return Boolean(errorData?.flows?.some((flow) => flow.id === 'verify_email'))
      },
      failure: t('auth:signupError'),
      onSuccess: () => router.push('/auth/signup-email-sent'),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">{t('auth:signupUsernameLabel')}</Label>
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
        <Label htmlFor="email">{t('auth:signupEmailLabel')}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={formState.email}
          onChange={handleFormStateEvent('email')}
        />
        {formErrors?.email && <p className="text-destructive text-sm">{formErrors.email[0]}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t('auth:signupPasswordLabel')}</Label>
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
        {t('auth:signupSubmit')}
      </Button>
    </form>
  )
}
