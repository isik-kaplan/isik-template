import { Button } from '@/components'

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

  it('applies the shared button and label style', async () => {
    await render(<Button testID="test-button" labelTestID="test-button-label" label="Go" onPress={() => undefined} />)
    expect(screen.getByTestId('test-button').props.style).toEqual({
      backgroundColor: 'black',
      borderRadius: 8,
      padding: 12,
      alignItems: 'center',
    })
    expect(screen.getByTestId('test-button-label').props.style).toEqual({ color: 'white' })
  })
})
