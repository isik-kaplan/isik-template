'use client'

import { useRouter } from 'next/navigation'

import { useEffect, useState } from 'react'
import type React from 'react'

import { Badge } from '@/components/base/badge'
import { Button } from '@/components/base/button'
import { SegmentedCodeInput } from '@/components/base/segmented-code-input'

import { useClientTranslation } from '@/i18n/client'
import { authOrigin } from '@/lib/authOrigin'
import { useFactorSubmit } from '@/lib/useFactorSubmit'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { RecoveryCodesReveal } from './RecoveryCodesReveal'
import QRCode from 'qrcode'

export type TotpSetupProps = {
  active: boolean
  /** Read server-side, because allauth rotates the secret on every status call. */
  secret?: string
  totpUrl?: string
  /** Why enrolling is refused right now (an unverified email), straight from allauth. */
  blockedReason?: string
}

export function TotpSetup({ active, secret, totpUrl, blockedReason }: TotpSetupProps) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const [isActive, setIsActive] = useState(active)
  const [qr, setQr] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>()
  const { isSubmitting, submit } = useFactorSubmit()

  // Only the drawing happens here: a pure function of the url, with no server state to go stale.
  useEffect(() => {
    if (!totpUrl) return
    let cancelled = false
    void QRCode.toDataURL(totpUrl, { margin: 1, width: 200 }).then((url) => {
      if (!cancelled) setQr(url)
    })
    return () => {
      cancelled = true
    }
  }, [totpUrl])

  async function activate(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const authApi = new AuthApi(authOrigin())
    const activated = await submit(() => authApi.activateTotp(code), {
      success: t('auth:totpActivated'),
      failure: t('auth:totpActivateError'),
      onFailure: setError,
    })
    if (!activated) return
    setIsActive(true)
    setCode('')
    // Activating generates the recovery codes, and this is the one moment they can be read.
    const { data } = await authApi.recoveryCodes()
    setRecoveryCodes(data?.data.unused_codes)
    router.refresh()
  }

  async function deactivate() {
    await submit(() => new AuthApi(authOrigin()).deactivateTotp(), {
      success: t('auth:totpDeactivated'),
      failure: t('auth:totpDeactivateError'),
      onSuccess: () => {
        setIsActive(false)
        setRecoveryCodes(undefined)
        router.refresh()
      },
    })
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="totp-heading">
      <h2 id="totp-heading" className="font-medium">
        {t('auth:totpTitle')}
      </h2>

      {recoveryCodes && <RecoveryCodesReveal codes={recoveryCodes} />}

      {isActive && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="secondary">{t('auth:totpActiveBadge')}</Badge>
          <Button variant="outline" size="sm" onClick={deactivate} disabled={isSubmitting}>
            {t('auth:totpDeactivateAction')}
          </Button>
        </div>
      )}
      {!isActive && blockedReason && <p className="text-sm text-muted-foreground">{blockedReason}</p>}
      {!isActive && !blockedReason && (
        <form onSubmit={activate} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{t('auth:totpSetupHint')}</p>
          <div className="flex flex-col items-center gap-3 border border-border p-4">
            {qr && (
              // A data: URI drawn in the browser - next/image has nothing to optimize here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={t('auth:totpQrAlt')} width={200} height={200} />
            )}
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm text-muted-foreground">{t('auth:totpSecretLabel')}</span>
              <code className="font-mono text-sm break-all" data-testid="totp-secret">
                {secret}
              </code>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <SegmentedCodeInput
              name="code"
              groups="3-3"
              label={t('auth:totpCodeLabel')}
              digitLabel={(position, total) => t('auth:codeDigitLabel', { position, total })}
              value={code}
              onChange={setCode}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <Button type="submit" disabled={isSubmitting || code.length === 0} className="self-center">
            {t('auth:totpActivateAction')}
          </Button>
        </form>
      )}
    </section>
  )
}
