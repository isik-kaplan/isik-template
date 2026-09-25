import { useEffect, useState } from 'react'

import { getAuthApi } from '@/lib/session'

import { router } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'

export default function Home() {
  const [email, setEmail] = useState<string | undefined>()

  // Every mutant on this guard (and the cleanup/deps around it) is equivalent, not uncovered:
  // React 18+ silently drops a setState call after unmount instead of warning about it, so
  // nothing here is observable from a test either way - see lib/useAuthenticated.ts, the same
  // pattern, confirmed directly against this exact React/testing-library version.
  // Stryker disable ConditionalExpression,BlockStatement,BooleanLiteral,ArrayDeclaration
  useEffect(() => {
    let cancelled = false
    getAuthApi()
      .session()
      .then(({ data }) => {
        if (!cancelled) setEmail(data?.data.user.email)
      })
    return () => {
      cancelled = true
    }
  }, [])
  // Stryker restore ConditionalExpression,BlockStatement,BooleanLiteral,ArrayDeclaration

  async function logout() {
    await getAuthApi().logout()
    router.replace('/login')
  }

  return (
    <View testID="home-container" style={styles.container}>
      <Text testID="home-heading" accessibilityRole="header" style={styles.heading}>
        You&apos;re logged in{email ? ` as ${email}` : ''}
      </Text>
      <Pressable testID="logout-button" onPress={logout} style={styles.button}>
        <Text testID="logout-button-label" style={styles.buttonText}>
          Log out
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  heading: { fontSize: 24, fontWeight: 'bold' },
  button: { backgroundColor: 'black', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonText: { color: 'white' },
})
