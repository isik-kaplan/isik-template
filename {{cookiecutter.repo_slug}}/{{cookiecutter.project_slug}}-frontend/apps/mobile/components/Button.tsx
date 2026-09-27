import { colors, radii, spacing } from '@/theme'

import { Pressable, StyleSheet, Text } from 'react-native'

type ButtonProps = {
  testID: string
  labelTestID?: string
  label: string
  onPress: () => void
  disabled?: boolean
}

/** The one filled-button shape every screen shares (submit, logout, ...). A separate labelTestID
 * lets a caller assert on the label's text/style independently of the pressable itself - the same
 * testID pair every screen already used before this component existed. */
export function Button({ testID, labelTestID, label, onPress, disabled }: ButtonProps) {
  return (
    <Pressable testID={testID} disabled={disabled} onPress={onPress} style={styles.button}>
      <Text testID={labelTestID} style={styles.label}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { backgroundColor: colors.primary, borderRadius: radii.sm, padding: spacing.md, alignItems: 'center' },
  label: { color: colors.onPrimary },
})
