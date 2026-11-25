import { look, useTheme } from '@/theme'

import { Text, type TextProps } from 'react-native'

/** Style is forced last so a caller's `style` can't drop the shared look. */
export function Heading(props: TextProps) {
  return <Text accessibilityRole="header" {...props} style={look.heading(useTheme())} />
}
