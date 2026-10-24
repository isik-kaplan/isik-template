import type { ReactNode } from 'react'

import { spacing } from '@/theme'

import { StyleSheet, View } from 'react-native'

type ScreenProps = {
  testID: string
  children: ReactNode
}

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
