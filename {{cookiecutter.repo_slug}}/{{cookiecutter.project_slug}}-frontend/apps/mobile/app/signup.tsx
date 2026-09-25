import { useState } from 'react'

import { getAuthApi } from '@/lib/session'

import { extractAuthErrors } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { Link, router } from 'expo-router'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

export default function Signup() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    setError(undefined)
    try {
      const { data, error: response } = await getAuthApi().signup({ username, email, password })
      if (data?.meta.is_authenticated) {
        router.replace('/(authenticated)/home')
        return
      }
      const authErrors = extractAuthErrors(response)
      setError(authErrors?.[0]?.message ?? 'Could not sign up - check the fields above.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View testID="signup-form" style={styles.form}>
      <Text testID="signup-heading" accessibilityRole="header" style={styles.heading}>
        Sign up
      </Text>
      <TextInput
        testID="username-input"
        placeholder="Username"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
        style={styles.input}
      />
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
        <Text testID="signup-error" style={styles.error}>
          {error}
        </Text>
      )}
      <Pressable testID="signup-submit" disabled={submitting} onPress={submit} style={styles.button}>
        <Text testID="signup-submit-label" style={styles.buttonText}>
          {submitting ? 'Signing up…' : 'Sign up'}
        </Text>
      </Pressable>
      <Link href="/login" testID="login-link">
        <Text>Already have an account? Log in</Text>
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
