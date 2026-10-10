'use client'

import { useRouter } from 'next/navigation'

import { useState } from 'react'
import type React from 'react'

import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'
import { SegmentedCodeInput } from '@/components/base/segmented-code-input'

import { useClientTranslation } from '@/i18n/client'
import { authOrigin } from '@/lib/authOrigin'
import { useAuthAPISubmit } from '@/lib/submit'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { useBrowserSupportsPasskeys } from '@isikk/core/hooks'
import { getCredential } from '@isikk/core/webauthn'

// The same factors answer two questions: the second step of a login, and proving it is you again
// before an act (the mfa_reauthenticate flow the prove page offers). Only the endpoints differ.
const CALLS = {
  login: {
    code: (api: AuthApi, code: string) => api.completeMfaChallenge(code),
    passkeyOptions: (api: AuthApi) => api.webauthnChallengeOptions(),
    passkey: (api: AuthApi, credential: Record<string, unknown>) => api.completeWebauthnChallenge(credential),
  },
  prove: {
    code: (api: AuthApi, code: string) => api.reauthenticateWithCode(code),
    passkeyOptions: (api: AuthApi) => api.webauthnReauthenticationOptions(),
    passkey: (api: AuthApi, credential: Record<string, unknown>) => api.reauthenticateWithWebauthn(credential),
  },
}

export type MfaChallengeFormProps = {
  /** The factors this user can answer with, from the pending mfa_authenticate (or mfa_reauthenticate) flow. */
  types: string[]
  redirectTo: string
  purpose?: keyof typeof CALLS
}

async function askForAssertion(options: PublicKeyCredentialRequestOptionsJSON) {
  try {
    return await getCredential(options)
  } catch {
    // Dismissing the browser's prompt is a way back to the other factors, not a failed attempt.
    return null
  }
}

/** The second step of a login whose password was right. */
export function MfaChallengeForm({ types, redirectTo, purpose = 'login' }: MfaChallengeFormProps) {
  const calls = CALLS[purpose]
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const [useRecoveryCode, setUseRecoveryCode] = useState(!types.includes('totp'))
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { isSubmitting, submit } = useAuthAPISubmit()
  const passkeysUsable = useBrowserSupportsPasskeys()

  function finish() {
    router.push(redirectTo)
    router.refresh()
  }

  function switchMode() {
    setUseRecoveryCode(!useRecoveryCode)
    setCode('')
    setError(null)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    await submit(() => calls.code(new AuthApi(authOrigin()), code.trim()), {
      failure: t('auth:twoFactorError'),
      setFormErrors: (errors) => setError(Object.values(errors)[0][0]),
      leavesOnSuccess: true,
      onSuccess: finish,
    })
  }

  async function answerWithPasskey() {
    setError(null)
    const authApi = new AuthApi(authOrigin())
    const { data } = await calls.passkeyOptions(authApi)
    const credential = data && (await askForAssertion(data.data.request_options.publicKey))
    if (!credential) return
    await submit(() => calls.passkey(authApi, credential), {
      failure: t('auth:twoFactorPasskeyError'),
      setFormErrors: (errors) => setError(Object.values(errors)[0][0]),
      leavesOnSuccess: true,
      onSuccess: finish,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {useRecoveryCode ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t('auth:twoFactorRecoveryHint')}</p>
            <Label htmlFor="recovery-code">{t('auth:twoFactorRecoveryCodeLabel')}</Label>
            <Input
              id="recovery-code"
              name="code"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground">{t('auth:twoFactorTotpHint')}</p>
            <SegmentedCodeInput
              name="code"
              groups="3-3"
              label={t('auth:totpCodeLabel')}
              digitLabel={(position, total) => t('auth:codeDigitLabel', { position, total })}
              value={code}
              onChange={setCode}
              autoFocus
            />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={isSubmitting || code.trim().length === 0}>
          {t('auth:twoFactorSubmit')}
        </Button>
      </form>
      {types.includes('webauthn') && passkeysUsable && (
        <Button variant="outline" className="w-full" onClick={answerWithPasskey} disabled={isSubmitting}>
          {t('auth:twoFactorPasskeyAction')}
        </Button>
      )}
      {types.includes('totp') && types.includes('recovery_codes') && (
        <Button variant="link" size="sm" onClick={switchMode}>
          {useRecoveryCode ? t('auth:twoFactorUseTotp') : t('auth:twoFactorUseRecoveryCode')}
        </Button>
      )}
    </div>
  )
}
