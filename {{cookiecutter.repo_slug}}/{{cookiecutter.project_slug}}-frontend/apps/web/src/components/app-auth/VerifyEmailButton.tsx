'use client'

import { useRouter } from 'next/navigation'

import { useState } from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n'
import { authOrigin } from '@/lib/authOrigin'

import { AuthApi, extractAuthErrors } from '@{{ cookiecutter.repo_slug }}/auth-api'

export function VerifyEmailButton({ verificationKey }: { verificationKey: string }) {
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const [error, setError] = useState(false)

  async function handleClick() {
    const { data, error: apiError, response } = await new AuthApi(authOrigin()).verifyEmail(verificationKey)
    // A confirmed-but-not-yet-authenticated key still comes back as a 401 (see schema.ts) - only
    // an actually invalid/expired key carries a non-empty `errors` array, so that's what a real
    // failure looks like here, not the response's HTTP status. ?.length, not just a truthiness
    // check - extractAuthErrors can return `[]` (present but empty), which is truthy in JS.
    if (data || !extractAuthErrors(apiError)?.length) {
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
