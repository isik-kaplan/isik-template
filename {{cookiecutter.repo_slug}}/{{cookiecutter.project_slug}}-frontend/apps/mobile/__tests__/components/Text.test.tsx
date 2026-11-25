import { Text } from '@/components'

import { inTheDark } from '@/jest/inTheDark'
import { look, themeOf } from '@/theme'

import { render, screen } from '@testing-library/react-native'

describe('Text', () => {
  it('draws body text in the theme, whatever style it is handed', async () => {
    const style = { color: 'red' }
    await render(
      <Text testID="body" style={style}>
        Hello
      </Text>,
      inTheDark
    )
    expect(screen.getByTestId('body').props.style).toEqual(look.text(themeOf('dark')))
    expect(screen.getByTestId('body').props.children).toBe('Hello')
  })

  it('draws muted text when asked', async () => {
    await render(
      <Text testID="body" muted>
        Hello
      </Text>,
      inTheDark
    )
    expect(screen.getByTestId('body').props.style).toEqual(look.muted(themeOf('dark')))
  })
})
