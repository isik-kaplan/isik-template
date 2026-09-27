import { ErrorText } from '@/components'

import { render, screen } from '@testing-library/react-native'

describe('ErrorText', () => {
  it('renders its text', async () => {
    await render(<ErrorText testID="test-error">Something went wrong.</ErrorText>)
    expect(screen.getByTestId('test-error').props.children).toBe('Something went wrong.')
  })

  it('applies the shared error style', async () => {
    await render(<ErrorText testID="test-error">Something went wrong.</ErrorText>)
    expect(screen.getByTestId('test-error').props.style).toEqual({ color: 'red' })
  })
})
