import { Separator } from '@/components/base/separator'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Separator', () => {
  it('defaults to horizontal, with matching styling', () => {
    render(<Separator />)

    const separator = screen.getByRole('separator')
    expect(separator.getAttribute('data-orientation')).toBe('horizontal')
    expect(separator.className).toContain('data-horizontal:h-px')
    expect(separator.className).toContain('data-horizontal:w-full')
  })

  it('switches to vertical styling when given that orientation', () => {
    render(<Separator orientation="vertical" />)

    const separator = screen.getByRole('separator')
    expect(separator.getAttribute('data-orientation')).toBe('vertical')
  })

  it('merges an extra className onto the base styling', () => {
    render(<Separator className="custom-class" />)

    const separator = screen.getByRole('separator')
    expect(separator.className).toContain('bg-border')
    expect(separator.className).toContain('custom-class')
  })
})
