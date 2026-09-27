import { radii, spacing } from '@/theme'

import { StyleSheet, TextInput, type TextInputProps } from 'react-native'

/** The one bordered-input shape every text field shares. Forwards every TextInput prop through
 * untouched (testID, value, onChangeText, secureTextEntry, ...) - this only owns the shared
 * style, forced last so a caller can't accidentally drop it. */
export function TextField(props: TextInputProps) {
  return <TextInput {...props} style={styles.input} />
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radii.sm, padding: spacing.md },
})
