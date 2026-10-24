import { headers } from 'next/headers'

import { PasskeyList } from '@/components/app-auth/PasskeyList'
import { RecoveryCodesSection } from '@/components/app-auth/RecoveryCodesSection'
import { TotpSetup } from '@/components/app-auth/TotpSetup'

import { REAUTHENTICATION_REQUIRED_HEADER, provePath } from '@/lib/reauthentication'
import { requestOrigin } from '@/lib/requestOrigin'
import { visitorFetch } from '@/lib/visitor'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { detailOf } from '@isikk/core/allauth'

export default async function ProfileTwoFactorPage() {
  // Gating already happened one level up, in profile/layout.tsx.
  const requestHeaders = await headers()
  const authOrigin = requestOrigin(requestHeaders).replace('://', '://auth.')
  const authApi = new AuthApi(authOrigin, {
    cookieHeader: requestHeaders.get('cookie') ?? undefined,
    baseFetch: visitorFetch(requestHeaders),
  })
  // Read here: allauth rotates the secret on every status call, voiding a QR code on screen.
  const [totp, { data: listed }] = await Promise.all([authApi.totpStatus(), authApi.authenticators()])
  // Not the recovery-codes endpoint: reading it spends the one viewing MFA_RECOVERY_CODES_SHOW_ONCE allows.
  const authenticators = listed?.data ?? []
  const recoveryCodes = authenticators.find((authenticator) => authenticator.type === 'recovery_codes')
  const passkeys = authenticators
    .filter((authenticator) => authenticator.type === 'webauthn')
    .map((authenticator) => ({
      id: authenticator.id as number,
      name: authenticator.name as string,
      createdAt: authenticator.created_at,
    }))
  // Asked before a secret is handed out, so a proof never leads away from a scanned QR code.
  const needsProof = totp.response?.headers.get(REAUTHENTICATION_REQUIRED_HEADER) === '1'
  const setup = totp.error && 'meta' in totp.error ? totp.error.meta : undefined

  return (
    <div className="flex flex-col gap-6">
      <TotpSetup
        active={Boolean(totp.data)}
        secret={setup?.secret}
        totpUrl={setup?.totp_url}
        proveHref={needsProof ? provePath('/profile/two-factor') : undefined}
        blockedReason={needsProof ? undefined : detailOf(totp.error)}
      />
      {recoveryCodes && (
        <RecoveryCodesSection
          unused={recoveryCodes.unused_code_count as number}
          total={recoveryCodes.total_code_count as number}
        />
      )}
      <PasskeyList passkeys={passkeys} />
    </div>
  )
}
