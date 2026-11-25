import { TextField } from '@/components'

import { inTheDark } from '@/jest/inTheDark'
import { look, themeOf } from '@/theme'

import { fireEvent, render, screen } from '@testing-library/react-native'

describe('TextField', () => {
  it('forwards value and onChangeText', async () => {
    const onChangeText = jest.fn()
    await render(<TextField testID="test-field" value="hello" onChangeText={onChangeText} />)
    expect(screen.getByTestId('test-field').props.value).toBe('hello')
    await fireEvent.changeText(screen.getByTestId('test-field'), 'world')
    expect(onChangeText).toHaveBeenCalledWith('world')
  })

  it('takes the shared input look and a muted placeholder from the theme', async () => {
    await render(<TextField testID="test-field" value="" onChangeText={() => undefined} />, inTheDark)
    const field = screen.getByTestId('test-field')
    expect([field.props.style, field.props.placeholderTextColor]).toEqual([
      look.field(themeOf('dark')),
      themeOf('dark').colors.muted,
    ])
  })
})
