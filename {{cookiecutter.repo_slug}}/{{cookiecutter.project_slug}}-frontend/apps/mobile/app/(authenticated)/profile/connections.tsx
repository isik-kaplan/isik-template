import { useEffect, useState } from 'react'

import { Heading, ListRow, Screen } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'

import { useIsMounted } from '@isikk/core/hooks'
import { Pressable, Text } from 'react-native'

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
    <Screen testID="profile-connections">
      <Heading testID="profile-connections-heading">{t('profileConnectionsHeading')}</Heading>
      {accounts.length === 0 ? (
        // Connecting a new provider needs a native sign-in SDK (Sign in with Apple / Google) this
        // template doesn't wire up yet - this screen only manages accounts already connected
        // elsewhere (e.g. on the web app) until that lands.
        <Text testID="profile-connections-empty">{t('profileConnectionsEmpty')}</Text>
      ) : (
        accounts.map((account) => (
          <ListRow key={account.id} testID={`connection-row-${account.id}`}>
            <Text testID={`connection-label-${account.id}`}>{account.provider.name}</Text>
            <Pressable testID={`disconnect-${account.id}`} onPress={() => disconnect(account.provider.id, account.uid)}>
              <Text>{t('profileConnectionsDisconnect')}</Text>
            </Pressable>
          </ListRow>
        ))
      )}
    </Screen>
  )
}
