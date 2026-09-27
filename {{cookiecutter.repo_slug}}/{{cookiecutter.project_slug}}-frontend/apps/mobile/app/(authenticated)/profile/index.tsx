import { Button, Heading, Screen } from '@/components'

import { useTranslation } from '@/lib/i18n'

import { router } from 'expo-router'

const LINKS = [
  { testID: 'profile-details-link', labelKey: 'profileDetailsLinkLabel', href: '/profile/details' as const },
  { testID: 'profile-emails-link', labelKey: 'profileEmailsLinkLabel', href: '/profile/emails' as const },
  { testID: 'profile-password-link', labelKey: 'profilePasswordLinkLabel', href: '/profile/password' as const },
  {
    testID: 'profile-connections-link',
    labelKey: 'profileConnectionsLinkLabel',
    href: '/profile/connections' as const,
  },
  { testID: 'profile-sessions-link', labelKey: 'profileSessionsLinkLabel', href: '/profile/sessions' as const },
] as const

export default function Profile() {
  const { t } = useTranslation()

  return (
    <Screen testID="profile-menu">
      <Heading testID="profile-heading">{t('profileMenuHeading')}</Heading>
      {LINKS.map((link) => (
        <Button key={link.href} testID={link.testID} label={t(link.labelKey)} onPress={() => router.push(link.href)} />
      ))}
    </Screen>
  )
}
