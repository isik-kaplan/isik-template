import { useEffect, useState } from 'react'

import { Button, Heading, Screen } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { forgetPush } from '@/lib/push'
import { getAuthApi } from '@/lib/session'

import { useIsMounted } from '@isikk/core/hooks'
import { router } from 'expo-router'

export default function Home() {
  const { t } = useTranslation()
  const [email, setEmail] = useState<string | undefined>()
  const isMounted = useIsMounted()

  useEffect(() => {
    getAuthApi()
      .session()
      .then(({ data }) => {
        if (isMounted()) setEmail(data?.data.user.email)
      })
  }, [isMounted])

  async function logout() {
    // While still signed in, which forgetting the phone needs. Unreachable, it's moved at the next sign-in on it.
    await forgetPush().catch(() => undefined)
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
      <Button
        testID="notifications-link"
        labelTestID="notifications-link-label"
        onPress={() => router.push('/notifications')}
        label={t('homeNotificationsLink')}
      />
      <Button testID="logout-button" labelTestID="logout-button-label" onPress={logout} label={t('homeLogout')} />
    </Screen>
  )
}
