'use client'

import { useRouter } from 'next/navigation'

import type React from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { authOrigin } from '@/lib/authOrigin'
import { broadcastSessionCleared } from '@/lib/sessionChannel'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

export type LogoutButtonProps = Omit<React.ComponentProps<typeof Button>, 'onClick'>

export function LogoutButton({ children, ...props }: LogoutButtonProps) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()

  async function handleLogout() {
    await new AuthApi(authOrigin()).logout()
    // Only this tab knows; siblings show stale content until their next request.
    broadcastSessionCleared()
    router.push('/')
    router.refresh()
  }

  return (
    <Button variant="outline" onClick={handleLogout} aria-label={t('auth:logoutButton')} {...props}>
      {children ?? t('auth:logoutButton')}
    </Button>
  )
}
