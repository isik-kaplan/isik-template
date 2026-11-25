import { useEffect, useState } from 'react'

import { Heading, ListRow, Screen, Text, TextButton } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'

import { useIsMounted } from '@isikk/core/hooks'

type ProviderAccount = { id: number; provider: { id: string; name: string }; uid: string; display: { name: string } }

export default function ProfileConnections() {
  const { t } = useTranslation()
  const [accounts, setAccounts] = useState<ProviderAccount[]>([])
  const isMounted = useIsMounted()

  useEffect(() => {
    getAuthApi()
      .providers()
      .then(({ data }) => {
        if (isMounted()) setAccounts(data?.data ?? [])
      })
  }, [isMounted])

  async function disconnect(providerId: string, uid: string) {
    const { data } = await getAuthApi().disconnectProvider(providerId, uid)
    if (data) setAccounts(data.data)
  }

  return (
    <Screen testID="profile-connections" back>
      <Heading testID="profile-connections-heading">{t('profileConnectionsHeading')}</Heading>
      {accounts.length === 0 ? (
        // Connecting a provider isn't wired up here; only already-connected accounts are managed.
        <Text testID="profile-connections-empty" muted>
          {t('profileConnectionsEmpty')}
        </Text>
      ) : (
        accounts.map((account) => (
          <ListRow key={account.id} testID={`connection-row-${account.id}`}>
            <Text testID={`connection-label-${account.id}`}>{account.provider.name}</Text>
            <TextButton
              testID={`disconnect-${account.id}`}
              label={t('profileConnectionsDisconnect')}
              onPress={() => disconnect(account.provider.id, account.uid)}
            />
          </ListRow>
        ))
      )}
    </Screen>
  )
}
