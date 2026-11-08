'use client'

import { useRouter } from 'next/navigation'

import { useMemo, useState } from 'react'
import type React from 'react'

import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'

import { useClientTranslation } from '@/i18n/client'
import { authOrigin } from '@/lib/authOrigin'
import { E164 } from '@/lib/phone'
import { useAuthAPISubmit, useAuthValidatedFormState } from '@/lib/submit'

import { AuthApi, hasPendingVerifyEmail, pendingMfaTypes } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { z } from 'zod'

/** The code allauth texted at signup, or at a login by a number never verified. */
export function VerifyPhoneForm({ redirectTo }: { redirectTo: string }) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const [changing, setChanging] = useState(false)
  const codeSchema = useMemo(() => z.object({ code: z.string().trim().min(1, t('auth:verifyPhoneError')) }), [t])
  const code = useAuthValidatedFormState(codeSchema, { code: '' })
  const numberSchema = useMemo(() => z.object({ phone: z.string().regex(E164, t('auth:validationPhoneInvalid')) }), [t])
  const number = useAuthValidatedFormState(numberSchema, { phone: '' })
  const resending = useAuthAPISubmit()

  async function verify(event: React.FormEvent) {
    event.preventDefault()
    await code.submit((value) => new AuthApi(authOrigin()).verifyPhone(value.code), {
      // The login goes on to whatever it still owes: the address after a signup, a second factor after a login.
      isSuccess: ({ data, error }) => Boolean(data) || hasPendingVerifyEmail(error) || pendingMfaTypes(error) !== null,
      failure: t('auth:verifyPhoneError'),
      leavesOnSuccess: true,
      onSuccess: ({ error }) => {
        if (hasPendingVerifyEmail(error)) {
          router.push('/auth/signup-email-sent')
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

  async function resend() {
    await resending.submit(() => new AuthApi(authOrigin()).resendPhoneCode(), {
      success: t('auth:verifyPhoneResent'),
      failure: t('auth:verifyPhoneResendError'),
    })
  }

  async function change(event: React.FormEvent) {
    event.preventDefault()
    await number.submit((value) => new AuthApi(authOrigin()).changePhone(value.phone), {
      success: t('auth:verifyPhoneChanged'),
      failure: t('auth:verifyPhoneChangeError'),
      onSuccess: () => {
        setChanging(false)
        number.resetFormState()
      },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={verify} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">{t('auth:verifyPhoneCodeLabel')}</Label>
          <Input
            id="code"
            name="code"
            autoComplete="one-time-code"
            autoFocus
            value={code.formState.code}
            onChange={code.handleFormStateEvent('code')}
            errorText={(code.formErrors?.code ?? code.formErrors?.non_field_errors)?.join('\n')}
          />
        </div>
        <Button type="submit" className="w-full" disabled={code.isSubmitting}>
          {t('auth:verifyPhoneSubmit')}
        </Button>
      </form>
      <Button variant="ghost" onClick={resend} disabled={resending.isSubmitting}>
        {t('auth:verifyPhoneResend')}
      </Button>
      {changing ? (
        <form onSubmit={change} className="flex items-start gap-2">
          <Input
            name="phone"
            type="tel"
            autoComplete="tel"
            aria-label={t('auth:signupPhoneLabel')}
            placeholder="+14155550123"
            value={number.formState.phone}
            onChange={number.handleFormStateEvent('phone')}
            errorText={(number.formErrors?.phone ?? number.formErrors?.non_field_errors)?.join('\n')}
          />
          <Button type="submit" disabled={number.isSubmitting}>
            {t('auth:verifyPhoneChangeSubmit')}
          </Button>
        </form>
      ) : (
        <Button variant="link" onClick={() => setChanging(true)}>
          {t('auth:verifyPhoneChangeAction')}
        </Button>
      )}
    </div>
  )
}
