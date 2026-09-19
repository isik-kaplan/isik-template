'use client'

import { usePathname, useRouter } from 'next/navigation'

import { useEffect, useState } from 'react'

import { Badge } from '@/components/base/badge'
import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n'
import { authOrigin } from '@/lib/authOrigin'
import { SOCIAL_PROVIDERS } from '@/lib/socialProviders'

import { AuthApi, extractAuthErrors } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { AutoFormButton } from './AutoFormButton'
import { ProviderIcon } from './ProviderIcon'
import { toast } from 'sonner'

type ProviderAccount = { id: number; provider: { id: string; name: string }; uid: string; display: { name: string } }

export type ConnectionsListProps = {
  initialProviders: ProviderAccount[]
  // Both full absolute URLs, computed server-side by the page (getRequestOrigin) and passed down
  // - see AutoFormButton's own comment on why this isn't built here from authOrigin().
  connectAction: string
  callbackUrl: string
  // The connect flow's callback_url points straight back at this page (see page.tsx's own
  // comment), so a failed attempt arrives as a query param rather than a thrown error - rendered
  // inline (not a toast: unlike handleDisconnect below, this didn't just result from an action
  // taken on this page, so a message that vanishes on its own would be easy to miss), then
  // stripped from the URL so a refresh doesn't repeat it.
  connectError?: string
}

export function ConnectionsList({ initialProviders, connectAction, callbackUrl, connectError }: ConnectionsListProps) {
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = useClientTranslation(['auth'])
  const [connected, setConnected] = useState(initialProviders)
  // Captured once at mount, not read from the prop on every render - router.replace below causes
  // page.tsx to re-fetch searchParams without `error`, which would otherwise make the banner
  // disappear the instant it's stripped from the URL.
  const [connectErrorShown] = useState(connectError)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (connectError) router.replace(pathname)
  }, [connectError, pathname, router])

  // allauth's own codes for a failed connect attempt (do_connect, socialaccount/internal/flows/
  // connect.py) - anything else (incl. `unknown`) falls through to a generic message.
  function getErrorMessage() {
    switch (connectErrorShown) {
      case undefined:
        return null
      case 'cancelled':
        return t('auth:profileConnectionsCancelled')
      case 'connected_other':
        return t('auth:profileConnectionsConnectedOther')
      case 'reauthentication_required':
        return t('auth:profileConnectionsReauthRequired')
      case 'permission_denied':
        return t('auth:profileConnectionsPermissionDenied')
      default:
        return t('auth:profileConnectionsConnectError')
    }
  }
  const errorMessage = getErrorMessage()

  async function handleDisconnect(providerId: string, account: string) {
    const { data, error } = await new AuthApi(authOrigin()).disconnectProvider(providerId, account)

    if (data) {
      setConnected(data.data as ProviderAccount[])
      toast.success(t('auth:profileConnectionsDisconnected'))
      return
    }

    toast.error(extractAuthErrors(error)?.[0]?.message ?? t('auth:profileConnectionsDisconnectError'))
  }

  if (SOCIAL_PROVIDERS.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('auth:profileConnectionsEmpty')}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {errorMessage && <p className="text-destructive text-sm">{errorMessage}</p>}
      <ul className="divide-y divide-border">
        {SOCIAL_PROVIDERS.map((provider) => {
          const account = connected.find((connectedAccount) => connectedAccount.provider.id === provider.id)
          const connectPayload = { provider: provider.id, callback_url: callbackUrl, process: 'connect' }

          return (
            <li key={provider.id} className="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2">
                <ProviderIcon providerId={provider.id} iconUrl={provider.icon} />
                <span>{provider.name}</span>
                <Badge
                  variant={
                    account
                      ? // Stryker disable next-line StringLiteral: equivalent mutant. cva's own
                        // defaultVariants fallback treats an empty-string variant the same as
                        // unset, so "" renders identically to 'default' here (verified directly
                        // against class-variance-authority).
                        'default'
                      : 'outline'
                  }
                >
                  {account ? t('auth:profileConnectionsConnectedBadge') : t('auth:profileConnectionsNotConnectedBadge')}
                </Badge>
              </div>
              {account ? (
                <Button variant="outline" onClick={() => handleDisconnect(provider.id, account.uid)}>
                  {t('auth:profileConnectionsDisconnectAction')}
                </Button>
              ) : (
                <AutoFormButton variant="outline" action={connectAction} payload={connectPayload}>
                  {t('auth:profileConnectionsConnectAction')}
                </AutoFormButton>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
