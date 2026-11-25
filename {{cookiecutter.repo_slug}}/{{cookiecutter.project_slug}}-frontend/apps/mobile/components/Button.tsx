import { look, useTheme } from '@/theme'

import { Pressable, Text } from 'react-native'

type ButtonProps = {
  testID: string
  labelTestID?: string
  label: string
  onPress: () => void
  disabled?: boolean
}

export function Button({ testID, labelTestID, label, onPress, disabled }: ButtonProps) {
  const theme = useTheme()
  return (
    <Pressable testID={testID} disabled={disabled} onPress={onPress} style={look.button(theme)}>
      <Text testID={labelTestID} style={look.buttonLabel(theme)}>
        {label}
      </Text>
    </Pressable>
  )
}
