// First: everything after it may draw an idempotency key or a uuid.
import { useAppearanceChoice } from '@/lib/appearance'
import '@/lib/crypto'
import '@/lib/i18n'
import { ThemeProvider, useTheme } from '@/theme'

import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

function Themed() {
  const { scheme, colors } = useTheme()
  // Never an inline object prop: double braces collide with the template's own syntax.
  const screenOptions = { headerShown: false, contentStyle: { backgroundColor: colors.background } }
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={screenOptions} />
    </>
  )
}

export default function RootLayout() {
  return (
    <ThemeProvider {...useAppearanceChoice()}>
      <Themed />
    </ThemeProvider>
  )
}
