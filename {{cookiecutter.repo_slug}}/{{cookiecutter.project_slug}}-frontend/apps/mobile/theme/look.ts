import type { Theme } from './ThemeContext'
import { radii } from './radii'
import { spacing } from './spacing'
import { typography } from './typography'
import type { TextStyle, ViewStyle } from 'react-native'

/** Each shared component's style for a theme, so screens and their tests read the same source. */
export const look = {
  screen: (): ViewStyle => ({ flexGrow: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md }),
  backBar: (): ViewStyle => ({ flexDirection: 'row' }),
  text: ({ colors }: Theme): TextStyle => ({ ...typography.body, color: colors.text }),
  muted: ({ colors }: Theme): TextStyle => ({ ...typography.body, color: colors.muted }),
  heading: ({ colors }: Theme): TextStyle => ({ ...typography.heading, color: colors.text }),
  button: ({ colors }: Theme): ViewStyle => ({
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    padding: spacing.md,
    alignItems: 'center',
  }),
  buttonLabel: ({ colors }: Theme): TextStyle => ({ ...typography.body, color: colors.onPrimary }),
  textButton: ({ colors }: Theme): TextStyle => ({ ...typography.body, color: colors.primary, fontWeight: '600' }),
  chosen: ({ colors }: Theme): TextStyle => ({
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  }),
  field: ({ colors }: Theme): TextStyle => ({
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.md,
  }),
  error: ({ colors }: Theme): TextStyle => ({ ...typography.body, color: colors.error }),
  row: ({ colors }: Theme): ViewStyle => ({
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  }),
  notice: ({ colors }: Theme): TextStyle => ({ ...typography.small, color: colors.muted, textAlign: 'center' }),
  link: (): TextStyle => ({ textDecorationLine: 'underline' }),
}
