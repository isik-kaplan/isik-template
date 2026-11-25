import { type ReactNode, createContext, useContext } from 'react'

import { type Palette, palettes } from './colors'
import { type ColorSchemeName, useColorScheme } from 'react-native'

export type Scheme = 'light' | 'dark'
export type Appearance = 'system' | Scheme
export const APPEARANCES: readonly Appearance[] = ['system', 'light', 'dark']

export type Theme = { scheme: Scheme; colors: Palette }

const THEMES: Record<Scheme, Theme> = {
  light: { scheme: 'light', colors: palettes.light },
  dark: { scheme: 'dark', colors: palettes.dark },
}

export function themeOf(scheme: Scheme): Theme {
  return THEMES[scheme]
}

/** What the phone asks for, or light when it asks for nothing. */
export function schemeOf(appearance: Appearance, phone: ColorSchemeName): Scheme {
  if (appearance !== 'system') return appearance
  return phone === 'dark' ? 'dark' : 'light'
}

type ThemeChoice = { appearance: Appearance; choose: (appearance: Appearance) => void }

const ChoiceContext = createContext<ThemeChoice | null>(null)

export function ThemeProvider({ children, ...choice }: ThemeChoice & { children: ReactNode }) {
  return <ChoiceContext.Provider value={choice}>{children}</ChoiceContext.Provider>
}

/** The person's choice of light, dark or the phone's; outside a provider, the phone's and nothing to change. */
export function useAppearance(): ThemeChoice {
  return useContext(ChoiceContext) ?? { appearance: 'system', choose: () => undefined }
}

export function useTheme(): Theme {
  const phone = useColorScheme()
  return themeOf(schemeOf(useAppearance().appearance, phone))
}
