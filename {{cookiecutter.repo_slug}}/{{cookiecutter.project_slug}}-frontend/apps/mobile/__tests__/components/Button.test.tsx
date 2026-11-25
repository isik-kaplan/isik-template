import { Button } from '@/components'

import { inTheDark } from '@/jest/inTheDark'
import { look, themeOf } from '@/theme'

import { fireEvent, render, screen } from '@testing-library/react-native'

describe('Button', () => {
  it('renders its label and calls onPress', async () => {
    const onPress = jest.fn()
    await render(<Button testID="test-button" labelTestID="test-button-label" label="Go" onPress={onPress} />)
    expect(screen.getByTestId('test-button-label').props.children).toBe('Go')
    await fireEvent.press(screen.getByTestId('test-button'))
    expect(onPress).toHaveBeenCalled()
  })

  it('honors the disabled prop', async () => {
    await render(<Button testID="test-button" label="Go" onPress={() => undefined} disabled />)
    expect(screen.getByTestId('test-button').props.accessibilityState.disabled).toBe(true)
  })

  it('takes the shared button and label look from the theme', async () => {
    await render(
      <Button testID="test-button" labelTestID="test-button-label" label="Go" onPress={() => undefined} />,
      inTheDark
    )
    expect(screen.getByTestId('test-button').props.style).toEqual(look.button(themeOf('dark')))
    expect(screen.getByTestId('test-button-label').props.style).toEqual(look.buttonLabel(themeOf('dark')))
  })
})
