import { Button } from '@/components/base/button'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Button', () => {
  it('applies its base styling and merges an extra className', () => {
    render(<Button className="custom-class">Go</Button>)

    const button = screen.getByRole('button', { name: 'Go' })
    expect(button.className).toContain('inline-flex')
    expect(button.className).toContain('custom-class')
  })

  it.each([
    ['default', 'bg-primary'],
    ['outline', 'border-border'],
    ['secondary', 'bg-secondary'],
    ['ghost', 'hover:bg-muted'],
    ['destructive', 'bg-destructive'],
    ['link', 'underline-offset-4'],
  ] as const)("applies the %s variant's own styling", (variant, expectedClass) => {
    render(<Button variant={variant}>Go</Button>)

    expect(screen.getByRole('button', { name: 'Go' }).className).toContain(expectedClass)
  })

  it.each([
    ['default', 'h-9'],
    ['sm', 'h-8'],
    ['lg', 'h-10'],
    ['icon', 'size-9'],
    ['icon-sm', 'size-8'],
  ] as const)("applies the %s size's own styling", (size, expectedClass) => {
    render(<Button size={size}>Go</Button>)

    expect(screen.getByRole('button', { name: 'Go' }).className).toContain(expectedClass)
  })

  it('defaults to the "default" variant and size', () => {
    render(<Button>Go</Button>)

    const button = screen.getByRole('button', { name: 'Go' })
    expect(button.className).toContain('bg-primary')
    expect(button.className).toContain('h-9')
  })
})
