import '@/lib/i18n'

import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

// Never an inline object prop: double braces collide with the template's own syntax.
const screenOptions = { headerShown: false }

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={screenOptions} />
    </>
  )
}
