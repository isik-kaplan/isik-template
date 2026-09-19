import { Badge } from '@/components/base/badge'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Badge', () => {
  it('defaults to the "default" variant, both in class and in data-variant', () => {
    render(<Badge>Hi</Badge>)

    const badge = screen.getByText('Hi')
    expect(badge.getAttribute('data-variant')).toBe('default')
    expect(badge.className).toContain('bg-primary')
  })

  it('marks itself with the badge slot', () => {
    render(<Badge>Hi</Badge>)

    expect(screen.getByText('Hi').getAttribute('data-slot')).toBe('badge')
  })

  it.each([
    ['default', 'bg-primary'],
    ['secondary', 'bg-secondary'],
    ['destructive', 'bg-destructive'],
    ['outline', 'border-border'],
  ] as const)("applies the %s variant's own styling", (variant, expectedClass) => {
    render(<Badge variant={variant}>Hi</Badge>)

    const badge = screen.getByText('Hi')
    expect(badge.getAttribute('data-variant')).toBe(variant)
    expect(badge.className).toContain(expectedClass)
    expect(badge.className).toContain('inline-flex')
  })

  it('merges an extra className onto the base styling', () => {
    render(<Badge className="custom-class">Hi</Badge>)

    const badge = screen.getByText('Hi')
    expect(badge.className).toContain('inline-flex')
    expect(badge.className).toContain('custom-class')
  })
})
