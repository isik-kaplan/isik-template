import { typography } from '@/theme'

import { StyleSheet, Text, type TextProps } from 'react-native'

/** Every screen's own title: same size/weight, always announced as a header to a screen reader.
 * Style is forced last so a caller can't accidentally drop the shared look by passing its own
 * `style` prop. */
export function Heading(props: TextProps) {
  return <Text accessibilityRole="header" {...props} style={styles.heading} />
}

const styles = StyleSheet.create({
  heading: typography.heading,
})
