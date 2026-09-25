import { useAuthenticated } from '@/lib/useAuthenticated'

import { Redirect } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

export default function Index() {
  const authenticated = useAuthenticated()

  if (authenticated === null) {
    return (
      <View testID="loading-container" style={styles.centered}>
        <ActivityIndicator testID="loading-indicator" />
      </View>
    )
  }

  return <Redirect href={authenticated ? '/(authenticated)/home' : '/login'} />
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
