import { look, useTheme } from '@/theme'

import { Text as NativeText, type TextProps as NativeTextProps } from 'react-native'

type TextProps = NativeTextProps & { muted?: boolean }

/** Body text in the theme's colour and face. Style is forced last so a caller's `style` can't drop the shared look. */
export function Text({ muted, ...props }: TextProps) {
  const theme = useTheme()
  return <NativeText {...props} style={muted ? look.muted(theme) : look.text(theme)} />
}
