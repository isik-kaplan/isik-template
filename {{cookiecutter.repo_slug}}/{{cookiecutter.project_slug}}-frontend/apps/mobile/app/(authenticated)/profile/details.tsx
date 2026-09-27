import { useEffect, useState } from 'react'

import { Heading, ListRow, Screen } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'

import { useIsMounted } from '@isikk/core/hooks'
import { Text } from 'react-native'

export default function ProfileDetails() {
  const { t } = useTranslation()
  const [user, setUser] = useState<{ username: string; email: string } | undefined>()
  const isMounted = useIsMounted()

  // Equivalent mutant either way, both the guard and the deps array - see
  // lib/useAuthenticated.ts's own copy of this same effect for why.
  // Stryker disable ArrayDeclaration,ConditionalExpression
  useEffect(() => {
    getAuthApi()
      .session()
      .then(({ data }) => {
        if (isMounted()) setUser(data?.data.user)
      })
  }, [isMounted])
  // Stryker restore ArrayDeclaration,ConditionalExpression

  return (
    <Screen testID="profile-details">
      <Heading testID="profile-details-heading">{t('profileDetailsHeading')}</Heading>
      <ListRow testID="profile-details-username-row">
        <Text>{t('profileDetailsUsernameLabel')}</Text>
        <Text testID="profile-details-username">{user?.username}</Text>
      </ListRow>
      <ListRow testID="profile-details-email-row">
        <Text>{t('profileDetailsEmailLabel')}</Text>
        <Text testID="profile-details-email">{user?.email}</Text>
      </ListRow>
    </Screen>
  )
}
