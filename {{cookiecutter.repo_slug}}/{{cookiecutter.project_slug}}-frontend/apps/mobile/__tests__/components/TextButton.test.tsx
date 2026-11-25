import { TextButton } from '@/components'

import { inTheDark } from '@/jest/inTheDark'
import { look, themeOf } from '@/theme'

import { fireEvent, render, screen } from '@testing-library/react-native'

describe('TextButton', () => {
  it('shows its label as a button and calls onPress', async () => {
    const onPress = jest.fn()
    await render(<TextButton testID="act" label="Remove" onPress={onPress} />)
    expect(screen.getByText('Remove')).toBeTruthy()
    expect(screen.getByTestId('act').props.accessibilityRole).toBe('button')
    await fireEvent.press(screen.getByTestId('act'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does nothing while disabled', async () => {
    const onPress = jest.fn()
    await render(<TextButton testID="act" label="Remove" onPress={onPress} disabled />)
    await fireEvent.press(screen.getByTestId('act'))
    expect([onPress.mock.calls.length, screen.getByTestId('act').props.accessibilityState.disabled]).toEqual([0, true])
  })

  // Named, not built: a look built while collecting would break the whole file under a mutant.
  it.each([
    [false, 'textButton'],
    [true, 'chosen'],
  ] as const)('when selected is %s, says so and takes its look from the theme', async (selected, expected) => {
    await render(<TextButton testID="act" label="Dark" onPress={() => undefined} selected={selected} />, inTheDark)
    expect(screen.getByTestId('act').props.accessibilityState.selected).toBe(selected)
    expect(screen.getByText('Dark').props.style).toEqual(look[expected](themeOf('dark')))
  })
})
