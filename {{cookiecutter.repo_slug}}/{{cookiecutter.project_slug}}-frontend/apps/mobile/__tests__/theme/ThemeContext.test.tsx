import { type Appearance, ThemeProvider, schemeOf, themeOf, useAppearance, useTheme } from '@/theme/ThemeContext'
import { palettes } from '@/theme/colors'

import { render, screen } from '@testing-library/react-native'
import * as ReactNative from 'react-native'
import { Text } from 'react-native'

function Shown() {
  const { scheme, colors } = useTheme()
  const { appearance } = useAppearance()
  return <Text testID="shown">{`${appearance} ${scheme} ${colors.background}`}</Text>
}

describe('schemeOf', () => {
  it.each([
    ['light', 'dark', 'light'],
    ['dark', 'light', 'dark'],
    ['system', 'dark', 'dark'],
    ['system', 'light', 'light'],
    ['system', 'unspecified', 'light'],
  ] as const)('reads %s with the phone on %s as %s', (appearance, phone, scheme) => {
    expect(schemeOf(appearance, phone)).toBe(scheme)
  })
})

describe('themeOf', () => {
  it('pairs each scheme with its palette', () => {
    expect([themeOf('light'), themeOf('dark')]).toEqual([
      { scheme: 'light', colors: palettes.light },
      { scheme: 'dark', colors: palettes.dark },
    ])
  })
})

describe('useTheme', () => {
  afterEach(() => jest.restoreAllMocks())

  it('follows the phone outside a provider', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark')
    await render(<Shown />)
    expect(screen.getByTestId('shown').props.children).toBe('system dark #121212')
  })

  it.each([
    ['light', 'light #ffffff'],
    ['dark', 'dark #121212'],
  ] as const)('takes the choice of %s over the phone', async (appearance: Appearance, shown) => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(appearance === 'dark' ? 'light' : 'dark')
    await render(
      <ThemeProvider appearance={appearance} choose={() => undefined}>
        <Shown />
      </ThemeProvider>
    )
    expect(screen.getByTestId('shown').props.children).toBe(`${appearance} ${shown}`)
  })

  it('offers a choose that does nothing outside a provider', async () => {
    let choice: ReturnType<typeof useAppearance> | undefined
    function Grab() {
      choice = useAppearance()
      return null
    }
    await render(<Grab />)
    expect(choice?.choose('dark')).toBeUndefined()
  })
})
