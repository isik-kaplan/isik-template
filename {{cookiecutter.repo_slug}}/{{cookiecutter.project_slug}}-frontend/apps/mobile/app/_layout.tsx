// Side-effect only: runs i18next's init once for the real app entry point. Each screen also
// imports useTranslation from here rather than from react-i18next directly, which triggers the
// same init for a screen rendered on its own in a test - see that module's own comment.
import '@/lib/i18n'

import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

// A plain object, not an inline prop, and every style below goes through StyleSheet.create() for
// the same reason: this template's own double-curly syntax collides with that JSX shorthand for
// passing an object straight through braces.
const screenOptions = { headerShown: false }

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={screenOptions} />
    </>
  )
}
