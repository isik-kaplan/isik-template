import { useAuthenticated } from '@/lib/useAuthenticated'

import { Redirect, Slot } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

export default function AuthenticatedLayout() {
  const authenticated = useAuthenticated()

  if (authenticated === null) {
    return (
      <View testID="loading-container" style={styles.centered}>
        <ActivityIndicator testID="loading-indicator" />
      </View>
    )
  }

  if (!authenticated) {
    return <Redirect href="/login" />
  }

  return <Slot />
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
