'use client'

import { useRouter } from 'next/navigation'

import { useState } from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { authOrigin } from '@/lib/authOrigin'
import { useAuthAPISubmit } from '@/lib/submit'
import { tooManyRequestsMessage } from '@/lib/tooManyRequestsMessage'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { retryAfterOf } from '@isikk/core'
import { detailOf } from '@isikk/core/allauth'

export function VerifyEmailButton({ verificationKey }: { verificationKey: string }) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const { isSubmitting, submit } = useAuthAPISubmit()
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    await submit(() => new AuthApi(authOrigin()).verifyEmail(verificationKey), {
      // A valid key can still answer 401; only a bad one carries `errors`. A 429 carries none either.
      isSuccess: ({ data, error: apiError, response }) =>
        response.status !== 429 && (Boolean(data) || detailOf(apiError) === undefined),
      failure: t('auth:verifyEmailError'),
      leavesOnSuccess: true,
      onSuccess: ({ response }) => router.push(response.status === 200 ? '/' : '/auth/login'),
      // Said beside the button rather than in a toast, since the button is all this page has.
      onRefusal: ({ response }) => {
        setError(response.status === 429 ? tooManyRequestsMessage(retryAfterOf(response)) : t('auth:verifyEmailError'))
        return true
      },
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleClick} className="w-full" disabled={isSubmitting}>
        {t('auth:verifyEmailSubmit')}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
