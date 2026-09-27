import { colors } from '@/theme'

import { StyleSheet, Text, type TextProps } from 'react-native'

/** The one error-message style every form on this screen shares. Style is forced last, same
 * reasoning as Heading. */
export function ErrorText(props: TextProps) {
  return <Text {...props} style={styles.error} />
}

const styles = StyleSheet.create({
  error: { color: colors.error },
})
