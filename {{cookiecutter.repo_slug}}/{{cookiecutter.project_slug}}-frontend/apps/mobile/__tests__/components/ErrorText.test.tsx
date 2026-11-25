import { ErrorText } from '@/components'

import { inTheDark } from '@/jest/inTheDark'
import { look, themeOf } from '@/theme'

import { render, screen } from '@testing-library/react-native'

describe('ErrorText', () => {
  it('renders its text', async () => {
    await render(<ErrorText testID="test-error">Something went wrong.</ErrorText>)
    expect(screen.getByTestId('test-error').props.children).toBe('Something went wrong.')
  })

  it('takes the shared error look from the theme', async () => {
    await render(<ErrorText testID="test-error">Something went wrong.</ErrorText>, inTheDark)
    expect(screen.getByTestId('test-error').props.style).toEqual(look.error(themeOf('dark')))
  })
})
