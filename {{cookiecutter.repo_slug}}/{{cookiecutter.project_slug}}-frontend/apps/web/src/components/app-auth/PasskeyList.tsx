'use client'

import { useRouter } from 'next/navigation'

import { useState } from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { authOrigin } from '@/lib/authOrigin'
import { useFactorSubmit } from '@/lib/useFactorSubmit'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { RecoveryCodesReveal } from './RecoveryCodesReveal'
import { toDate } from '@isikk/core'
import { useBrowserSupportsPasskeys } from '@isikk/core/hooks'
import { createCredential, inASecureContext } from '@isikk/core/webauthn'

export type Passkey = {
  id: number
  name: string
  /** Seconds since the epoch, as allauth sends it. */
  createdAt: number
}

export type PasskeyListProps = {
  passkeys: Passkey[]
}

async function register(options: PublicKeyCredentialCreationOptionsJSON) {
  try {
    return await createCredential(options)
  } catch {
    // Cancelling the browser's own prompt is the ordinary way out of this flow, not a failure.
    return null
  }
}

export function PasskeyList({ passkeys }: PasskeyListProps) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const usable = useBrowserSupportsPasskeys()
  const [isEnrolling, setIsEnrolling] = useState(false)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>()
  const { submit } = useFactorSubmit()

  async function enroll() {
    setIsEnrolling(true)
    const authApi = new AuthApi(authOrigin())
    // Fetched at the moment of enrollment: the options carry a one-shot challenge.
    const options = await submit(() => authApi.webauthnCreationOptions(), { failure: t('auth:passkeyEnrollError') })
    const credential = options && (await register(options.data.creation_options.publicKey))
    const added =
      credential &&
      (await submit(() => authApi.addWebauthn(credential), {
        success: t('auth:passkeyEnrolled'),
        failure: t('auth:passkeyEnrollError'),
      }))
    // A first factor generates recovery codes, and this is the one moment they can be read.
    if (added?.meta.recovery_codes_generated) {
      const { data } = await authApi.recoveryCodes()
      setRecoveryCodes(data?.data.unused_codes)
    }
    if (added) router.refresh()
    setIsEnrolling(false)
  }

  async function remove(id: number) {
    setRemovingId(id)
    await submit(() => new AuthApi(authOrigin()).removeWebauthn([id]), {
      success: t('auth:passkeyRemoved'),
      failure: t('auth:passkeyRemoveError'),
      onSuccess: () => router.refresh(),
    })
    setRemovingId(null)
  }

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6" aria-labelledby="passkeys-heading">
      <h2 id="passkeys-heading" className="font-medium">
        {t('auth:passkeyTitle')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('auth:passkeyHint')}</p>

      {recoveryCodes && <RecoveryCodesReveal codes={recoveryCodes} />}

      {passkeys.length > 0 && (
        <ul className="divide-y divide-border">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{passkey.name}</span>
                <span className="text-sm text-muted-foreground">
                  {t('auth:passkeyAddedOn', { date: toDate(passkey.createdAt, 'seconds').toLocaleDateString() })}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => remove(passkey.id)}
                disabled={removingId !== null}
                aria-label={t('auth:passkeyRemoveLabel', { name: passkey.name })}
              >
                {t('auth:passkeyRemoveAction')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {usable ? (
        <Button onClick={enroll} disabled={isEnrolling} className="self-start" variant="outline" size="sm">
          {t('auth:passkeyEnrollAction')}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          {inASecureContext() ? t('auth:passkeyBrowserUnsupported') : t('auth:passkeyInsecureOrigin')}
        </p>
      )}
    </section>
  )
}
