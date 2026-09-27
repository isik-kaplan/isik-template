import type { ReactNode } from 'react'

import { spacing } from '@/theme'

import { StyleSheet, View } from 'react-native'

type ScreenProps = {
  testID: string
  children: ReactNode
}

/** The full-screen container shape every screen shares: centered content, generous padding,
 * consistent vertical rhythm between fields. One definition so a spacing change moves every
 * screen at once instead of N separate StyleSheet.create() copies. */
export function Screen({ testID, children }: ScreenProps) {
  return (
    <View testID={testID} style={styles.screen}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
})
