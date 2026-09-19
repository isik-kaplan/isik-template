'use client'

import { useRouter } from 'next/navigation'

import { useMemo } from 'react'
import type React from 'react'

import { Button } from '@/components/base/button'
import { Label } from '@/components/base/label'

import { useClientTranslation } from '@/i18n'
import { authOrigin } from '@/lib/authOrigin'
import { useValidatedFormState } from '@/lib/useValidatedFormState'

import { AuthApi, extractAuthErrors } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { PasswordInput } from './PasswordInput'
import { z } from 'zod'

export function ResetPasswordForm({ resetKey }: { resetKey: string }) {
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  // Stryker disable next-line ArrayDeclaration: equivalent mutant. t's reference never
  // changes across renders in this single-language app, so this memo never actually
  // recomputes either way.
  const schema = useMemo(() => z.object({ password: z.string().min(8, t('auth:validationPasswordMinLength')) }), [t])
  const { formState, formErrors, handleFormStateEvent, isSubmitting, submit } = useValidatedFormState(schema, {
    password: '',
  })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    await submit(() => new AuthApi(authOrigin()).resetPassword(resetKey, formState.password), {
      // A confirmed-but-not-yet-authenticated key still comes back as a 401 (see schema.ts) - only
      // an actually invalid/expired key carries a non-empty `errors` array, so that's what a real
      // failure looks like here, not the response's HTTP status. ?.length, not just a truthiness
      // check - extractAuthErrors can return `[]` (present but empty), which is truthy in JS.
      isSuccess: ({ data, error }) => Boolean(data) || !extractAuthErrors(error)?.length,
      // Stryker disable next-line StringLiteral: equivalent mutant, unreachable rather than
      // untested - useApiSubmit only falls back to this string when toFormErrors(error) is
      // undefined, which by isSuccess above already means this call counted as a success.
      failure: t('auth:resetPasswordError'),
      onSuccess: ({ response }) => router.push(response.status === 200 ? '/' : '/auth/login'),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t('auth:resetPasswordNewPasswordLabel')}</Label>
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
        {t('auth:resetPasswordSubmit')}
      </Button>
    </form>
  )
}
