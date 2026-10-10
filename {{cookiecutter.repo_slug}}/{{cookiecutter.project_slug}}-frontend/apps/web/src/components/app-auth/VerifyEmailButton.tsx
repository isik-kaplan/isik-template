'use client'

import { useRouter } from 'next/navigation'

import { useState } from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { authOrigin } from '@/lib/authOrigin'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { detailOf } from '@isikk/core/allauth'

export function VerifyEmailButton({ verificationKey }: { verificationKey: string }) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const [error, setError] = useState(false)

  async function handleClick() {
    const { data, error: apiError, response } = await new AuthApi(authOrigin()).verifyEmail(verificationKey)
    // A confirmed-but-not-yet-authenticated key still comes back as a 401 (see schema.ts) - only
    // an actually invalid/expired key carries a non-empty `errors` array, so that's what a real
    // failure looks like here, not the response's HTTP status.
    if (data || detailOf(apiError) === undefined) {
      router.push(response.status === 200 ? '/' : '/auth/login')
      return
    }
    setError(true)
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleClick} className="w-full">
        {t('auth:verifyEmailSubmit')}
      </Button>
      {error && <p className="text-destructive text-sm">{t('auth:verifyEmailError')}</p>}
    </div>
  )
}
