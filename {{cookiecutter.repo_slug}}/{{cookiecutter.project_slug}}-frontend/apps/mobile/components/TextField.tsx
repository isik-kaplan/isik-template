import { look, useTheme } from '@/theme'

import { TextInput, type TextInputProps } from 'react-native'

/**
 * Style is forced last so a caller's `style` can't drop the shared look.
 * A focus look must keep any shadow props constant and vary only their opacity: adding them on focus rebuilds the
 * native view on Android, and the keyboard opens and shuts at once.
 */
export function TextField(props: TextInputProps) {
  const theme = useTheme()
  return <TextInput placeholderTextColor={theme.colors.muted} {...props} style={look.field(theme)} />
}
