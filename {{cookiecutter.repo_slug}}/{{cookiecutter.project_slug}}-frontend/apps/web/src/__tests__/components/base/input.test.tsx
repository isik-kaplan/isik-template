import { Input } from '@/components/base/input'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Input', () => {
  it('applies its base styling and merges an extra className', () => {
    render(<Input aria-label="name" className="custom-class" />)

    const input = screen.getByLabelText('name')
    expect(input.className).toContain('rounded-none')
    expect(input.className).toContain('custom-class')
  })

  it('shows the given errorText below the field', () => {
    render(<Input aria-label="name" errorText="Required." />)

    expect(screen.getByText('Required.')).toBeTruthy()
  })

  it('shows no error text when none is given', () => {
    render(<Input aria-label="name" />)

    expect(screen.queryByText('Required.')).toBeNull()
  })
})
