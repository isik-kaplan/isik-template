'use client'

import { useRouter } from 'next/navigation'

import { useMemo, useState } from 'react'
import type React from 'react'

import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'

import { useClientTranslation } from '@/i18n/client'
import { createAuthApi } from '@/lib/apiClients'
import { authOrigin } from '@/lib/authOrigin'
import { useAuthValidatedFormState } from '@/lib/submit'

import type { components } from '@{{ cookiecutter.repo_slug }}/api'

import { z } from 'zod'

type Recipient = components['schemas']['ReauthenticationRecipient']

/** Without passwords: a code sent to one of the account's verified addresses or numbers. */
export function ProveByCodeForm({ recipients, next }: { recipients: Recipient[]; next: string }) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [sendFailed, setSendFailed] = useState(false)
  const schema = useMemo(() => z.object({ code: z.string().trim().min(1, t('auth:proveCodeRequired')) }), [t])
  const { formState, formErrors, handleFormStateEvent, isSubmitting, submit } = useAuthValidatedFormState(schema, {
    code: '',
  })

  async function send(recipient: Recipient) {
    setIsSending(true)
    const { error } = await createAuthApi(authOrigin()).requestReauthenticationCode(
      recipient.email ? { email: recipient.email } : { phone: recipient.phone! }
    )
    setIsSending(false)
    setSendFailed(Boolean(error))
    if (!error) setSentTo(recipient.email ?? recipient.phone!)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    await submit(({ code }) => createAuthApi(authOrigin()).confirmReauthenticationCode(code), {
      failure: t('auth:proveCodeError'),
      leavesOnSuccess: true,
      onSuccess: () => router.replace(next),
    })
  }

  if (sentTo === null) {
    return (
      <div className="flex flex-col gap-2">
        {recipients.map((recipient) => {
          const to = recipient.email ?? recipient.phone!
          return (
            <Button key={to} variant="outline" disabled={isSending} onClick={() => send(recipient)}>
              {t('auth:proveCodeSend', { to })}
            </Button>
          )
        })}
        {sendFailed && <p className="text-destructive text-sm">{t('auth:proveCodeSendError')}</p>}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{t('auth:proveCodeSent', { to: sentTo })}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">{t('auth:proveCodeLabel')}</Label>
        <Input
          id="code"
          name="code"
          autoComplete="one-time-code"
          value={formState.code}
          onChange={handleFormStateEvent('code')}
        />
        {formErrors?.code && <p className="text-destructive text-sm">{formErrors.code[0]}</p>}
      </div>
      {formErrors?.non_field_errors && <p className="text-destructive text-sm">{formErrors.non_field_errors[0]}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {t('auth:proveCodeSubmit')}
      </Button>
    </form>
  )
}
