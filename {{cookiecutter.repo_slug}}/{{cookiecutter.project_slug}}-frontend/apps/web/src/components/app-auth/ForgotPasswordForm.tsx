'use client'

import { useRouter } from 'next/navigation'

import { useMemo } from 'react'
import type React from 'react'

import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'

import { useClientTranslation } from '@/i18n/client'
import { authOrigin } from '@/lib/authOrigin'
import { useAuthValidatedFormState } from '@/lib/submit'
import { tooManyRequestsMessage } from '@/lib/tooManyRequestsMessage'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { retryAfterOf } from '@isikk/core'
import { toast } from 'sonner'
import { z } from 'zod'

export function ForgotPasswordForm() {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const schema = useMemo(() => z.object({ email: z.email(t('auth:validationEmailInvalid')) }), [t])
  const { formState, formErrors, handleFormStateEvent, validate } = useAuthValidatedFormState(schema, { email: '' })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!validate()) return
    // allauth intentionally never reveals whether the address is registered - always proceed, unless
    // it refused to send anything for now, which "email sent" would misreport.
    const { response } = await new AuthApi(authOrigin()).requestPasswordReset(formState.email)
    if (response.status === 429) {
      toast.error(tooManyRequestsMessage(retryAfterOf(response)))
      return
    }
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
