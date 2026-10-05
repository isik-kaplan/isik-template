'use client'

import { useState } from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { createAuthApi } from '@/lib/apiClients'
import { authOrigin } from '@/lib/authOrigin'

/** The way back for an account with no password whose provider cannot prove anything: a password
 * set from a link in its own inbox, which every later act can then be proved with. */
export function ProveSetPasswordByEmail({ email }: { email: string }) {
  const { t } = useClientTranslation(['auth'])
  const [sent, setSent] = useState(false)
  const [isSending, setIsSending] = useState(false)

  async function send() {
    setIsSending(true)
    // allauth never says whether the address is registered, so there is no refusal to show.
    await createAuthApi(authOrigin()).requestPasswordReset(email)
    // The button goes away with this, so there is no sending state to clear.
    setSent(true)
  }

  if (sent) {
    return <p className="text-muted-foreground text-sm">{t('auth:proveSetPasswordSent', { email })}</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">{t('auth:proveSetPasswordHint')}</p>
      <Button variant="outline" disabled={isSending} onClick={send}>
        {t('auth:proveSetPasswordAction')}
      </Button>
    </div>
  )
}
