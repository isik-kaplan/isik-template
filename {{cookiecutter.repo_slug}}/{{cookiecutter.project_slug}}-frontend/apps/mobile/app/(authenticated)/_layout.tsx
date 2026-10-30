import { useEffect } from 'react'

import { registerForPush, showPushesWhileOpen } from '@/lib/push'
import { useAuthenticated } from '@/lib/useAuthenticated'

import { useLastNotificationResponse } from 'expo-notifications'
import { Redirect, Slot, router } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

export default function AuthenticatedLayout() {
  const authenticated = useAuthenticated()
  const tapped = useLastNotificationResponse()

  useEffect(() => {
    if (!authenticated) return
    showPushesWhileOpen()
    // A simulator has no push token, nor a build without Firebase's file: the app works on without pushes.
    registerForPush().catch(() => undefined)
  }, [authenticated])

  // Also the push that opened the app, from closed.
  useEffect(() => {
    if (authenticated && tapped) router.push('/notifications')
  }, [authenticated, tapped])

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
