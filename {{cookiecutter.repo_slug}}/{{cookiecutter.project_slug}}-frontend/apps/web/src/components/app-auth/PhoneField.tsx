'use client'

import type React from 'react'

import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'

import { PHONE } from '@/config/phone'
import { useClientTranslation } from '@/i18n/client'
import type { Translate } from '@/i18n/config'
import { E164 } from '@/lib/phone'

import { z } from 'zod'

/** Required, optional, or never shown and so always empty, as the project's phone option says. */
export function phoneSchema(t: Translate) {
  const phone = z.string().regex(E164, t('auth:validationPhoneInvalid'))
  return PHONE === 'required' ? phone : phone.or(z.literal(''))
}

/** Only what the form should send: an empty optional number is no number. */
export function phoneOf(value: { phone: string }) {
  return value.phone ? { phone: value.phone } : {}
}

export type PhoneFieldProps = {
  value: string
  error?: string
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

export function PhoneField({ value, error, onChange }: PhoneFieldProps) {
  const { t } = useClientTranslation(['auth'])
  if (PHONE === 'none') return null
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="phone">
        {PHONE === 'required' ? t('auth:signupPhoneLabel') : t('auth:signupPhoneOptionalLabel')}
      </Label>
      <Input
        id="phone"
        name="phone"
        type="tel"
        autoComplete="tel"
        placeholder="+14155550123"
        aria-describedby="phone-hint"
        value={value}
        onChange={onChange}
      />
      <p id="phone-hint" className="text-muted-foreground text-xs">
        {t('auth:phoneHint')}
      </p>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
