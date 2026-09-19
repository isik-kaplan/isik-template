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

import { z } from 'zod'

export function ForgotPasswordForm() {
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  // Stryker disable next-line ArrayDeclaration: equivalent mutant. t's reference never
  // changes across renders in this single-language app, so this memo never actually
  // recomputes either way.
  const schema = useMemo(() => z.object({ email: z.email(t('auth:validationEmailInvalid')) }), [t])
  const { formState, formErrors, handleFormStateEvent, validate } = useValidatedFormState(schema, { email: '' })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!validate()) return
    // allauth intentionally never reveals whether the address is registered - always proceed.
    await new AuthApi(authOrigin()).requestPasswordReset(formState.email)
    router.push('/auth/password-reset-email-sent')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t('auth:forgotPasswordEmailLabel')}</Label>
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
      <Button type="submit" className="w-full">
        {t('auth:forgotPasswordSubmit')}
      </Button>
    </form>
  )
}
