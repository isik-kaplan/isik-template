import { SeparatorWithText } from '@/components/app-auth/SeparatorWithText'

import { test } from '@fast-check/vitest'
import { render } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

describe('SeparatorWithText', () => {
  it('renders its children', () => {
    const { container } = render(<SeparatorWithText>Or</SeparatorWithText>)
    expect(container.textContent).toBe('Or')
  })

  // container.textContent, not getByText - getByText normalizes whitespace and would spuriously
  // fail on whitespace-heavy fuzzed input.
  test.prop([fc.string()])('renders arbitrary text content unchanged', (text) => {
    const { container } = render(<SeparatorWithText>{text}</SeparatorWithText>)
    expect(container.textContent).toBe(text)
  })
})
