import { Fragment } from 'react'

import { useTranslation } from '@/lib/i18n'
import { LEGAL_SLUGS, legalTitles, legalUrl } from '@/lib/legalDocuments'
import { look, useTheme } from '@/theme'

import { Linking, Text } from 'react-native'

// Placeholder for the document list, so the links go where the translation puts it.
const LIST = '\u0000'

/** Joined by hand: Hermes does not ship Intl.ListFormat. */
export function LegalConsentNotice() {
  const { t } = useTranslation()
  const theme = useTheme()
  const titles = legalTitles(t)
  const [before, after] = t('legalConsentNotice', { documents: LIST }).split(LIST)

  return (
    <Text testID="legal-consent-notice" style={look.notice(theme)}>
      {before}
      {LEGAL_SLUGS.map((slug, index) => (
        <Fragment key={slug}>
          {index > 0 && (index === LEGAL_SLUGS.length - 1 ? t('legalListFinalSeparator') : t('legalListSeparator'))}
          <Text
            testID={`legal-link-${slug}`}
            accessibilityRole="link"
            style={look.link()}
            onPress={() => void Linking.openURL(legalUrl(slug))}
          >
            {titles[slug]}
          </Text>
        </Fragment>
      ))}
      {after}
    </Text>
  )
}
