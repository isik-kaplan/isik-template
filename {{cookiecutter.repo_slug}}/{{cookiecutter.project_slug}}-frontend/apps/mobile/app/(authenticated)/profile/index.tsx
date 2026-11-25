import { Button, Heading, ListRow, Screen, Text, TextButton } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { passwordsSignIn } from '@/lib/socialProviders'
import { APPEARANCES, spacing, useAppearance } from '@/theme'

import { router } from 'expo-router'
import { StyleSheet, View } from 'react-native'

const LINKS = [
  { testID: 'profile-details-link', labelKey: 'profileDetailsLinkLabel', href: '/profile/details' as const },
  { testID: 'profile-emails-link', labelKey: 'profileEmailsLinkLabel', href: '/profile/emails' as const },
{%- if cookiecutter.phone != "none" %}
  { testID: 'profile-phone-link', labelKey: 'profilePhoneLinkLabel', href: '/profile/phone' as const },
{%- endif %}
  { testID: 'profile-password-link', labelKey: 'profilePasswordLinkLabel', href: '/profile/password' as const },
  {
    testID: 'profile-connections-link',
    labelKey: 'profileConnectionsLinkLabel',
    href: '/profile/connections' as const,
  },
  { testID: 'profile-sessions-link', labelKey: 'profileSessionsLinkLabel', href: '/profile/sessions' as const },
  { testID: 'profile-delete-link', labelKey: 'profileDeleteLinkLabel', href: '/profile/delete' as const },
] as const

const APPEARANCE_LABELS = {
  system: 'appearanceSystem',
  light: 'appearanceLight',
  dark: 'appearanceDark',
} as const

export default function Profile() {
  const { t } = useTranslation()
  const { appearance, choose } = useAppearance()

  return (
    <Screen testID="profile-menu" back>
      <Heading testID="profile-heading">{t('profileMenuHeading')}</Heading>
      {LINKS.filter((link) => link.href !== '/profile/password' || passwordsSignIn()).map((link) => (
        <Button key={link.href} testID={link.testID} label={t(link.labelKey)} onPress={() => router.push(link.href)} />
      ))}
      <ListRow testID="appearance-row">
        <Text>{t('appearanceLabel')}</Text>
        <View testID="appearance-choices" style={styles.choices}>
          {APPEARANCES.map((each) => (
            <TextButton
              key={each}
              testID={`appearance-${each}`}
              label={t(APPEARANCE_LABELS[each])}
              selected={appearance === each}
              onPress={() => choose(each)}
            />
          ))}
        </View>
      </ListRow>
    </Screen>
  )
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', gap: spacing.md },
})
