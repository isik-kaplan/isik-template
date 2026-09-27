import { TextField } from '@/components'

import { fireEvent, render, screen } from '@testing-library/react-native'

describe('TextField', () => {
  it('forwards value and onChangeText', async () => {
    const onChangeText = jest.fn()
    await render(<TextField testID="test-field" value="hello" onChangeText={onChangeText} />)
    expect(screen.getByTestId('test-field').props.value).toBe('hello')
    await fireEvent.changeText(screen.getByTestId('test-field'), 'world')
    expect(onChangeText).toHaveBeenCalledWith('world')
  })

  it('applies the shared input style', async () => {
    await render(<TextField testID="test-field" value="" onChangeText={() => undefined} />)
    expect(screen.getByTestId('test-field').props.style).toEqual({ borderWidth: 1, borderRadius: 8, padding: 12 })
  })
})
