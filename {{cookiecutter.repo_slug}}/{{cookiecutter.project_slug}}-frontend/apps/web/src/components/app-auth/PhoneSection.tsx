'use client'

import { useMemo, useState } from 'react'
import type React from 'react'

import { Badge } from '@/components/base/badge'
import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'

import { useClientTranslation } from '@/i18n/client'
import { createAuthApi } from '@/lib/apiClients'
import { authOrigin } from '@/lib/authOrigin'
import { E164 } from '@/lib/phone'
import { useAuthValidatedFormState } from '@/lib/submit'

import { z } from 'zod'

export type PhoneNumber = { phone: string; verified: boolean }

/** The account's number. A new one is texted a code, and replaces the old only once that code comes back. */
export function PhoneSection({ initialPhone }: { initialPhone: PhoneNumber | null }) {
  const { t } = useClientTranslation(['auth'])
  const [phone, setPhone] = useState(initialPhone)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const numberSchema = useMemo(() => z.object({ phone: z.string().regex(E164, t('auth:validationPhoneInvalid')) }), [t])
  const number = useAuthValidatedFormState(numberSchema, { phone: '' })
  const codeSchema = useMemo(() => z.object({ code: z.string().trim().min(1, t('auth:verifyPhoneError')) }), [t])
  const code = useAuthValidatedFormState(codeSchema, { code: '' })

  async function change(event: React.FormEvent) {
    event.preventDefault()
    await number.submit((value) => createAuthApi(authOrigin()).changePhone(value.phone), {
      failure: t('auth:profilePhoneChangeError'),
      onSuccess: ({ data }) => {
        setSentTo(data.data[0].phone)
        number.resetFormState()
      },
    })
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault()
    await code.submit((value) => createAuthApi(authOrigin()).verifyPhone(value.code), {
      success: t('auth:profilePhoneChanged'),
      failure: t('auth:verifyPhoneError'),
      onSuccess: () => {
        setPhone({ phone: sentTo as string, verified: true })
        setSentTo(null)
        code.resetFormState()
      },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {phone ? (
        <div className="flex items-center gap-2">
          <span>{phone.phone}</span>
          <Badge variant={phone.verified ? 'default' : 'outline'}>
            {phone.verified ? t('auth:profileEmailVerifiedBadge') : t('auth:profileEmailUnverifiedBadge')}
          </Badge>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t('auth:profilePhoneNone')}</p>
      )}
      {sentTo ? (
        <form onSubmit={verify} className="flex flex-col gap-2">
          <p className="text-sm">{t('auth:profilePhoneCodeSent', { phone: sentTo })}</p>
          <div className="flex items-start gap-2">
            <Input
              name="code"
              autoComplete="one-time-code"
              aria-label={t('auth:verifyPhoneCodeLabel')}
              value={code.formState.code}
              onChange={code.handleFormStateEvent('code')}
              errorText={(code.formErrors?.code ?? code.formErrors?.non_field_errors)?.join('\n')}
            />
            <Button type="submit" disabled={code.isSubmitting}>
              {t('auth:verifyPhoneSubmit')}
            </Button>
          </div>
        </form>
      ) : (
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
            {phone ? t('auth:profilePhoneChangeSubmit') : t('auth:profilePhoneAddSubmit')}
          </Button>
        </form>
      )}
    </div>
  )
}
