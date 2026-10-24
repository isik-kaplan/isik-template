'use client'

import { useRouter } from 'next/navigation'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { authOrigin } from '@/lib/authOrigin'
import { broadcastSessionCleared } from '@/lib/sessionChannel'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

/** "Not you?": signs out and asks the same question again of whoever signs in next. */
export function ConsentSignOut({ username, authorizeUrl }: { username: string; authorizeUrl: string }) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()

  async function signOut() {
    await new AuthApi(authOrigin()).logout()
    broadcastSessionCleared()
    router.push(`/auth/login?next=${encodeURIComponent(authorizeUrl)}`)
  }

  return (
    <p className="text-center text-sm text-muted-foreground">
      {t('auth:oauthConsentNotYou', { username })}{' '}
      <Button variant="link" className="h-auto p-0" onClick={signOut}>
        {t('auth:oauthConsentSignOut')}
      </Button>
    </p>
  )
}
