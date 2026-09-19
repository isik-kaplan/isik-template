import { Label } from '@/components/base/label'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Label', () => {
  it('applies its base styling and merges an extra className', () => {
    render(<Label className="custom-class">Name</Label>)

    const label = screen.getByText('Name')
    expect(label.className).toContain('select-none')
    expect(label.className).toContain('custom-class')
  })

  it('marks itself with the label slot', () => {
    render(<Label>Name</Label>)

    expect(screen.getByText('Name').getAttribute('data-slot')).toBe('label')
  })
})
