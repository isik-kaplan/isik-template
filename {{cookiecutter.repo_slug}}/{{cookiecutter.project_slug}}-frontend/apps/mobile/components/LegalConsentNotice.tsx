import { Fragment } from 'react'

import { useTranslation } from '@/lib/i18n'
import { LEGAL_SLUGS, legalTitles, legalUrl } from '@/lib/legalDocuments'
import { colors } from '@/theme'

import { Linking, StyleSheet, Text } from 'react-native'

// Stands in for the document list while the sentence is translated, so the links go where the translation put it.
const LIST = '\u0000'

/** "By continuing, you agree to the ..." with a link to each document's web page, shown wherever an account is
 * created. Joined by hand rather than with Intl.ListFormat, which Hermes does not ship. */
export function LegalConsentNotice() {
  const { t } = useTranslation()
  const titles = legalTitles(t)
  const [before, after] = t('legalConsentNotice', { documents: LIST }).split(LIST)

  return (
    <Text testID="legal-consent-notice" style={styles.notice}>
      {before}
      {LEGAL_SLUGS.map((slug, index) => (
        <Fragment key={slug}>
          {index > 0 && (index === LEGAL_SLUGS.length - 1 ? t('legalListFinalSeparator') : t('legalListSeparator'))}
          <Text
            testID={`legal-link-${slug}`}
            accessibilityRole="link"
            style={styles.link}
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

const styles = StyleSheet.create({
  notice: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  link: { textDecorationLine: 'underline' },
})
