'use client'

import { useRouter } from 'next/navigation'

import { useMemo } from 'react'
import type React from 'react'

import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'

import { useClientTranslation } from '@/i18n/client'
import { authOrigin } from '@/lib/authOrigin'
import { offeredNames } from '@/lib/names'
import { VERIFY_PHONE_PATH } from '@/lib/phone'
import { useAuthValidatedFormState } from '@/lib/submit'

import { AuthApi, hasPendingVerifyEmail, pendingFlow } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { NameFields, nameSchema, shownNames } from './NameFields'
import { PasswordInput } from './PasswordInput'
import { PhoneField, phoneOf, phoneSchema } from './PhoneField'
import { z } from 'zod'

export function SignupForm() {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const shown = offeredNames()
  const schema = useMemo(
    () =>
      z.object({
        ...nameSchema(t),
        email: z.email(t('auth:validationEmailInvalid')),
        phone: phoneSchema(t),
        password: z.string().min(8, t('auth:validationPasswordMinLength')),
      }),
    [t]
  )
  const { formState, formErrors, handleFormStateEvent, isSubmitting, submit } = useAuthValidatedFormState(schema, {
    first_name: '',
    last_name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
  })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const authApi = new AuthApi(authOrigin())
    await submit(
      (value) =>
        authApi.signup({
          email: value.email,
          ...phoneOf(value),
          password: value.password,
          ...shownNames(value, shown),
        }),
      {
        // Mandatory verification answers a 401 naming what is owed: the number's code first, when one was given.
        isSuccess: ({ data, error, response }) =>
          Boolean(data) ||
          (response.status === 401 && (hasPendingVerifyEmail(error) || Boolean(pendingFlow(error, 'verify_phone')))),
        failure: t('auth:signupError'),
        leavesOnSuccess: true,
        onSuccess: ({ error }) =>
          router.push(pendingFlow(error, 'verify_phone') ? VERIFY_PHONE_PATH : '/auth/signup-email-sent'),
      }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <NameFields shown={shown} values={formState} errors={formErrors} onChange={handleFormStateEvent} />
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
      <PhoneField value={formState.phone} error={formErrors?.phone?.[0]} onChange={handleFormStateEvent('phone')} />
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
