import type { ReactNode } from 'react'

import { useTranslation } from '@/lib/i18n'
import { look } from '@/theme'

import { TextButton } from './TextButton'
import { router } from 'expo-router'
import { ScrollView, View } from 'react-native'

type ScreenProps = {
  testID: string
  // A way back for a screen pushed on top of another; the stack draws no header.
  back?: boolean
  children: ReactNode
}

export function Screen({ testID, back, children }: ScreenProps) {
  const { t } = useTranslation()
  return (
    <ScrollView testID={testID} contentContainerStyle={look.screen()} keyboardShouldPersistTaps="handled">
      {back && (
        <View style={look.backBar()}>
          <TextButton testID="back-button" label={t('back')} onPress={() => router.back()} />
        </View>
      )}
      {children}
    </ScrollView>
  )
}
