import { look, useTheme } from '@/theme'

import { Pressable, Text } from 'react-native'

type TextButtonProps = {
  testID: string
  label: string
  onPress: () => void
  disabled?: boolean
  selected?: boolean
}

/** A row's own action, lighter than a Button. */
export function TextButton({ testID, label, onPress, disabled, selected }: TextButtonProps) {
  const theme = useTheme()
  const state = { selected }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={state}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={selected ? look.chosen(theme) : look.textButton(theme)}>{label}</Text>
    </Pressable>
  )
}
