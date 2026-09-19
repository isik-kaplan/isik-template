'use client'

import { useRouter } from 'next/navigation'

import type React from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n'
import { authOrigin } from '@/lib/authOrigin'
import { broadcastSessionCleared } from '@/lib/sessionChannel'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

export type LogoutButtonProps = Omit<React.ComponentProps<typeof Button>, 'onClick'>

export function LogoutButton({ children, ...props }: LogoutButtonProps) {
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()

  async function handleLogout() {
    await new AuthApi(authOrigin()).logout()
    // This tab is the only one that knows - the shared cookie is already gone, but a sibling tab
    // sits on stale rendered content until it makes a request of its own.
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
