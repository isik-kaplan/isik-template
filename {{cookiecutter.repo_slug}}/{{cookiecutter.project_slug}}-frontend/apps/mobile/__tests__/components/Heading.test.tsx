import { Heading } from '@/components'

import { render, screen } from '@testing-library/react-native'

describe('Heading', () => {
  it('renders its text and marks itself as a header', async () => {
    await render(<Heading testID="test-heading">Title</Heading>)
    const heading = screen.getByTestId('test-heading')
    expect(heading.props.children).toBe('Title')
    expect(heading.props.accessibilityRole).toBe('header')
  })

  it('applies the shared heading style', async () => {
    await render(<Heading testID="test-heading">Title</Heading>)
    expect(screen.getByTestId('test-heading').props.style).toEqual({ fontSize: 24, fontWeight: 'bold' })
  })
})
