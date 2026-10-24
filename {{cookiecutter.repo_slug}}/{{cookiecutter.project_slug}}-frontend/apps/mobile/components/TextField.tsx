import { radii, spacing } from '@/theme'

import { StyleSheet, TextInput, type TextInputProps } from 'react-native'

/** Style is forced last so a caller's `style` can't drop the shared look. */
export function TextField(props: TextInputProps) {
  return <TextInput {...props} style={styles.input} />
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radii.sm, padding: spacing.md },
})
