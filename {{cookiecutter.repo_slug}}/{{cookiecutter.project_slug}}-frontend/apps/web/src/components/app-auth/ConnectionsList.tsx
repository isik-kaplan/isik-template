'use client'

import { usePathname, useRouter } from 'next/navigation'

import { useEffect, useState } from 'react'

import { Badge } from '@/components/base/badge'
import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { createAuthApi } from '@/lib/apiClients'
import { authOrigin } from '@/lib/authOrigin'
import { provePath } from '@/lib/reauthentication'
import { socialProviders } from '@/lib/socialProviders'

import { AutoFormButton } from './AutoFormButton'
import { ProviderIcon } from './ProviderIcon'
import { detailOf } from '@isikk/core/allauth'
import { toast } from 'sonner'

// allauth's own code for a connect the backend's re-authentication gate turned back.
const REAUTHENTICATION_REQUIRED_ERROR = 'reauthentication_required'

type ProviderAccount = { id: number; provider: { id: string; name: string }; uid: string; display: { name: string } }

export type ConnectionsListProps = {
  initialProviders: ProviderAccount[]
  // Absolute URLs, computed server-side by the page (see AutoFormButton).
  connectAction: string
  callbackUrl: string
  // A failed connect arrives as a query param: shown inline, not as a toast nobody was watching
  // for, then stripped from the URL so a refresh doesn't repeat it.
  connectError?: string
}

export function ConnectionsList({ initialProviders, connectAction, callbackUrl, connectError }: ConnectionsListProps) {
  const { t } = useClientTranslation(['auth'])
  const [connected, setConnected] = useState(initialProviders)
  // Captured at mount: stripping it from the URL re-renders without `error`.
  const [connectErrorShown] = useState(connectError)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!connectError) return
    // Refused until they prove it is them: off to prove it, then back here.
    router.replace(connectError === REAUTHENTICATION_REQUIRED_ERROR ? provePath(pathname) : pathname)
  }, [connectError, pathname, router])

  // allauth's codes for a failed connect; anything else gets a generic message.
  function getErrorMessage() {
    switch (connectErrorShown) {
      case undefined:
      case REAUTHENTICATION_REQUIRED_ERROR:
        return null
      case 'cancelled':
        return t('auth:profileConnectionsCancelled')
      case 'connected_other':
        return t('auth:profileConnectionsConnectedOther')
      case 'permission_denied':
        return t('auth:profileConnectionsPermissionDenied')
      default:
        return t('auth:profileConnectionsConnectError')
    }
  }
  const errorMessage = getErrorMessage()

  async function handleDisconnect(providerId: string, account: string) {
    const { data, error } = await createAuthApi(authOrigin()).disconnectProvider(providerId, account)

    if (data) {
      setConnected(data.data as ProviderAccount[])
      toast.success(t('auth:profileConnectionsDisconnected'))
      return
    }

    toast.error(detailOf(error) ?? t('auth:profileConnectionsDisconnectError'))
  }

  const providers = socialProviders()
  if (providers.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('auth:profileConnectionsEmpty')}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {errorMessage && <p className="text-destructive text-sm">{errorMessage}</p>}
      <ul className="divide-y divide-border">
        {providers.map((provider) => {
          const account = connected.find((connectedAccount) => connectedAccount.provider.id === provider.id)
          const connectPayload = { provider: provider.id, callback_url: callbackUrl, process: 'connect' }

          return (
            <li key={provider.id} className="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2">
                <ProviderIcon providerId={provider.id} name={provider.name} iconUrl={provider.icon} />
                <span>{provider.name}</span>
                <Badge variant={account ? 'default' : 'outline'}>
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
