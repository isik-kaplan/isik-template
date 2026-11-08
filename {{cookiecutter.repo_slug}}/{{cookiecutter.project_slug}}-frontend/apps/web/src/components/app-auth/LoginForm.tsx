'use client'

import { useRouter } from 'next/navigation'

import { useMemo } from 'react'
import type React from 'react'

import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'

import { PHONE } from '@/config/phone'
import { useClientTranslation } from '@/i18n/client'
import type { Translate } from '@/i18n/config'
import { authOrigin } from '@/lib/authOrigin'
import { handleLogsIn } from '@/lib/names'
import { VERIFY_PHONE_PATH } from '@/lib/phone'
import { VERIFY_EMAIL_REQUIRED_PATH } from '@/lib/sessionChannel'
import { useAuthValidatedFormState } from '@/lib/submit'

import { AuthApi, hasPendingVerifyEmail, pendingFlow, pendingMfaTypes } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { PasswordInput } from './PasswordInput'
import { z } from 'zod'

/** The identifier the backend takes the typed login as: a number signs in only where every account has one. */
function credentialsOf(login: string) {
  if (PHONE === 'required' && login.startsWith('+')) return { phone: login }
  return login.includes('@') ? { email: login } : { username: login }
}

/** The login field's label and its empty message, naming only the ways in this project has. */
function identifierTexts(t: Translate, byHandle: boolean, byPhone: boolean): [string, string] {
  // Spelled out: i18next-parser only detects literal keys.
  if (byHandle && byPhone) return [t('auth:loginIdentifierWithPhoneLabel'), t('auth:validationLoginWithPhoneRequired')]
  if (byHandle) return [t('auth:loginIdentifierLabel'), t('auth:validationLoginRequired')]
  if (byPhone) return [t('auth:loginEmailOrPhoneLabel'), t('auth:validationEmailOrPhoneRequired')]
  return [t('auth:loginEmailLabel'), t('auth:validationEmailRequired')]
}

export function LoginForm({ redirectTo = '/' }: { redirectTo?: string }) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const [label, required] = identifierTexts(t, handleLogsIn(), PHONE === 'required')
  const schema = useMemo(
    () =>
      z.object({
        login: z.string().min(1, required),
        password: z.string().min(1, t('auth:validationPasswordRequired')),
      }),
    [t, required]
  )
  const { formState, formErrors, handleFormStateEvent, isSubmitting, submit } = useAuthValidatedFormState(schema, {
    login: '',
    password: '',
  })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const authApi = new AuthApi(authOrigin())
    await submit(({ login, password }) => authApi.login({ ...credentialsOf(login), password }), {
      // Not a wrong password: a 409 is already logged in, or a verification or second-factor flow is pending.
      isSuccess: ({ data, error, response }) =>
        Boolean(data) ||
        response.status === 409 ||
        hasPendingVerifyEmail(error) ||
        Boolean(pendingFlow(error, 'verify_phone')) ||
        pendingMfaTypes(error) !== null,
      failure: t('auth:loginError'),
      // Every branch below takes this form off the screen.
      leavesOnSuccess: true,
      onSuccess: ({ error }) => {
        if (hasPendingVerifyEmail(error)) {
          router.push(VERIFY_EMAIL_REQUIRED_PATH)
          return
        }
        // A number never verified gets a fresh code at each login until it is.
        if (pendingFlow(error, 'verify_phone')) {
          router.push(`${VERIFY_PHONE_PATH}?next=${encodeURIComponent(redirectTo)}`)
          return
        }
        if (pendingMfaTypes(error) !== null) {
          router.push(`/auth/two-factor?next=${encodeURIComponent(redirectTo)}`)
          return
        }
        router.push(redirectTo)
        router.refresh()
      },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="login">{label}</Label>
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
