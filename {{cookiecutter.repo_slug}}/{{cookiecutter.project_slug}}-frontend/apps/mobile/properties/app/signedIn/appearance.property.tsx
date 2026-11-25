import ProfileMenu from '@/app/(authenticated)/profile/index'
import RootLayout from '@/app/_layout'
import { useAppearanceChoice } from '@/lib/appearance'
import { APPEARANCES, ThemeProvider, palettes, schemeOf } from '@/theme'

import { kept, locked } from '../../support/store'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'
import * as ReactNative from 'react-native'

// The profile under the same provider the root layout gives it.
function ChosenOnTheProfile() {
  return (
    <ThemeProvider {...useAppearanceChoice()}>
      <ProfileMenu />
    </ThemeProvider>
  )
}

const background = (view: Awaited<ReturnType<typeof render>>) =>
  JSON.parse(view.getByTestId('stack').props.accessibilityValue.text).contentStyle.backgroundColor

describe('the appearance', () => {
  afterEach(() => jest.restoreAllMocks())

  it('draws what was kept on the phone, and keeps the last choice made on the profile for the next launch', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.constantFrom(...APPEARANCES, 'sepia'), { nil: undefined }),
        fc.constantFrom('light', 'dark') as fc.Arbitrary<'light' | 'dark'>,
        fc.array(fc.constantFrom(...APPEARANCES), { minLength: 1, maxLength: 4 }),
        async (stored, phone, choices) => {
          kept.clear()
          locked.current = false
          if (stored !== undefined) kept.set('appearance', stored)
          jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(phone)
          const start = stored === 'light' || stored === 'dark' ? stored : 'system'

          const launch = await render(<RootLayout />)
          await waitFor(() => expect(background(launch)).toBe(palettes[schemeOf(start, phone)].background))
          await launch.unmount()

          const profile = await render(<ChosenOnTheProfile />)
          await waitFor(() =>
            expect(profile.getByTestId(`appearance-${start}`).props.accessibilityState.selected).toBe(true)
          )
          for (const choice of choices) await fireEvent.press(profile.getByTestId(`appearance-${choice}`))
          const last = choices[choices.length - 1]
          const selected = APPEARANCES.filter(
            (each) => profile.getByTestId(`appearance-${each}`).props.accessibilityState.selected
          )
          expect([selected, kept.get('appearance')]).toEqual([[last], last])
          await profile.unmount()

          const next = await render(<RootLayout />)
          await waitFor(() => expect(background(next)).toBe(palettes[schemeOf(last, phone)].background))
          await next.unmount()
        }
      )
    )
  })

  it('follows the phone when the keychain is locked, and still takes a choice for as long as the app runs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('light', 'dark') as fc.Arbitrary<'light' | 'dark'>,
        fc.constantFrom(...APPEARANCES),
        async (phone, choice) => {
          kept.clear()
          kept.set('appearance', phone === 'dark' ? 'light' : 'dark')
          locked.current = true
          jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(phone)

          const launch = await render(<RootLayout />)
          await waitFor(() => expect(background(launch)).toBe(palettes[phone].background))
          await launch.unmount()

          const profile = await render(<ChosenOnTheProfile />)
          await fireEvent.press(profile.getByTestId(`appearance-${choice}`))
          expect(profile.getByTestId(`appearance-${choice}`).props.accessibilityState.selected).toBe(true)
          await profile.unmount()
          locked.current = false
        }
      )
    )
  })

  it('changes nothing from a profile drawn outside the root layout', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...APPEARANCES), async (choice) => {
        kept.clear()
        locked.current = false
        const profile = await render(<ProfileMenu />)
        await fireEvent.press(profile.getByTestId(`appearance-${choice}`))
        expect([profile.getByTestId('appearance-system').props.accessibilityState.selected, kept.size]).toEqual([
          true,
          0,
        ])
        await profile.unmount()
      })
    )
  })
})
