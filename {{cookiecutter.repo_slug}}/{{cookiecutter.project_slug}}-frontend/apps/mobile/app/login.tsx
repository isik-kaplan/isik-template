import { useState } from 'react'

import { getAuthApi } from '@/lib/session'

import { extractAuthErrors } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { Link, router } from 'expo-router'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    setError(undefined)
    try {
      const { data, error: response } = await getAuthApi().login({ email, password })
      if (data?.meta.is_authenticated) {
        router.replace('/(authenticated)/home')
        return
      }
      const authErrors = extractAuthErrors(response)
      setError(authErrors?.[0]?.message ?? 'Could not log in - check your email and password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View testID="login-form" style={styles.form}>
      <Text testID="login-heading" accessibilityRole="header" style={styles.heading}>
        Log in
      </Text>
      <TextInput
        testID="email-input"
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />
      <TextInput
        testID="password-input"
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={styles.input}
      />
      {error && (
        <Text testID="login-error" style={styles.error}>
          {error}
        </Text>
      )}
      <Pressable testID="login-submit" disabled={submitting} onPress={submit} style={styles.button}>
        <Text testID="login-submit-label" style={styles.buttonText}>
          {submitting ? 'Logging in…' : 'Log in'}
        </Text>
      </Pressable>
      <Link href="/signup" testID="signup-link">
        <Text>Need an account? Sign up</Text>
      </Link>
    </View>
  )
}

const styles = StyleSheet.create({
  form: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  heading: { fontSize: 24, fontWeight: 'bold' },
  input: { borderWidth: 1, borderRadius: 8, padding: 12 },
  error: { color: 'red' },
  button: { backgroundColor: 'black', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonText: { color: 'white' },
})
