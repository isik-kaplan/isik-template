import type { ReactNode } from 'react'

import { colors, spacing } from '@/theme'

import { StyleSheet, View } from 'react-native'

type ListRowProps = {
  testID?: string
  children: ReactNode
}

/** One row in a settings-style list: a divider between rows, consistent vertical padding. Used by
 * every profile screen that lists things (emails, connected providers, active sessions). */
export function ListRow({ testID, children }: ListRowProps) {
  return (
    <View testID={testID} style={styles.row}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
})
