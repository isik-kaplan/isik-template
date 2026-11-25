import { Heading } from '@/components'

import { inTheDark } from '@/jest/inTheDark'
import { look, themeOf } from '@/theme'

import { render, screen } from '@testing-library/react-native'

describe('Heading', () => {
  it('renders its text and marks itself as a header', async () => {
    await render(<Heading testID="test-heading">Title</Heading>)
    const heading = screen.getByTestId('test-heading')
    expect(heading.props.children).toBe('Title')
    expect(heading.props.accessibilityRole).toBe('header')
  })

  it('takes the shared heading look from the theme', async () => {
    await render(<Heading testID="test-heading">Title</Heading>, inTheDark)
    expect(screen.getByTestId('test-heading').props.style).toEqual(look.heading(themeOf('dark')))
  })
})
