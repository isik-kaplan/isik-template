'use client'

import { useState } from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { useAPISubmit } from '@/lib/submit'

import { IssuedSecret } from './IssuedSecret'
import { useIdempotencyKey } from '@isikk/core/hooks'

/** A new secret for the same client id. Existing tokens keep working unless asked otherwise: wrong for a leak. */
export function RotateSecretPanel({ applicationId, clientId }: { applicationId: number; clientId: string }) {
  const { t } = useClientTranslation(['auth'])
  const { isSubmitting, submit } = useAPISubmit()
  const [revoke, setRevoke] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  // A retry after a lost answer is the same rotation, not a second one voiding the first secret too.
  const rotation = useIdempotencyKey()

  async function rotate() {
    await submit(
      () => createApi(apiOrigin()).rotateOAuthApplicationSecret(applicationId, revoke, rotation.keyFor(revoke)),
      {
        failure: t('auth:applicationRotateError'),
        onSuccess: ({ data }) => {
          rotation.used()
          setSecret(data.client_secret)
        },
      }
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t('auth:applicationRotateHint')}</p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={revoke}
          onChange={(event) => setRevoke(event.target.checked)}
        />
        {t('auth:applicationRotateRevoke')}
      </label>
      <Button variant="outline" className="self-start" disabled={isSubmitting} onClick={rotate}>
        {t('auth:applicationRotate')}
      </Button>
      {secret && <IssuedSecret clientId={clientId} secret={secret} />}
    </div>
  )
}
