import { useEffect, useState } from 'react'

import { Button, Heading, Screen } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'

import { useIsMounted } from '@isikk/core/hooks'
import { router } from 'expo-router'

export default function Home() {
  const { t } = useTranslation()
  const [email, setEmail] = useState<string | undefined>()
  const isMounted = useIsMounted()

  // Equivalent mutant either way, both the guard and the deps array - see
  // lib/useAuthenticated.ts's own copy of this same effect for why.
  // Stryker disable ArrayDeclaration,ConditionalExpression
  useEffect(() => {
    getAuthApi()
      .session()
      .then(({ data }) => {
        if (isMounted()) setEmail(data?.data.user.email)
      })
  }, [isMounted])
  // Stryker restore ArrayDeclaration,ConditionalExpression

  async function logout() {
    await getAuthApi().logout()
    router.replace('/login')
  }

  return (
    <Screen testID="home-container">
      <Heading testID="home-heading">{email ? t('homeHeadingWithEmail', { email }) : t('homeHeading')}</Heading>
      <Button
        testID="profile-link"
        labelTestID="profile-link-label"
        onPress={() => router.push('/profile')}
        label={t('homeProfileLink')}
      />
      <Button testID="logout-button" labelTestID="logout-button-label" onPress={logout} label={t('homeLogout')} />
    </Screen>
  )
}
