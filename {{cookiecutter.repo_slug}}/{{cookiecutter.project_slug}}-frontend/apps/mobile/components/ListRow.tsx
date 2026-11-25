import type { ReactNode } from 'react'

import { look, useTheme } from '@/theme'

import { View } from 'react-native'

type ListRowProps = {
  testID?: string
  children: ReactNode
}

export function ListRow({ testID, children }: ListRowProps) {
  return (
    <View testID={testID} style={look.row(useTheme())}>
      {children}
    </View>
  )
}
