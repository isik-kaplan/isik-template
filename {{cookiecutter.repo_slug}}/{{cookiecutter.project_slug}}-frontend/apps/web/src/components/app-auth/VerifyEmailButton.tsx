'use client'

import { useRouter } from 'next/navigation'

import { useState } from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { authOrigin } from '@/lib/authOrigin'
import { tooManyRequestsMessage } from '@/lib/tooManyRequestsMessage'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { retryAfterOf } from '@isikk/core'
import { detailOf } from '@isikk/core/allauth'

export function VerifyEmailButton({ verificationKey }: { verificationKey: string }) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    const { data, error: apiError, response } = await new AuthApi(authOrigin()).verifyEmail(verificationKey)
    // Before the check below: a refusal for coming too often carries no `errors` either.
    if (response.status === 429) {
      setError(tooManyRequestsMessage(retryAfterOf(response)))
      return
    }
    // A valid key can still answer 401; only a bad one carries `errors`.
    if (data || detailOf(apiError) === undefined) {
      router.push(response.status === 200 ? '/' : '/auth/login')
      return
    }
    setError(t('auth:verifyEmailError'))
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleClick} className="w-full">
        {t('auth:verifyEmailSubmit')}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
