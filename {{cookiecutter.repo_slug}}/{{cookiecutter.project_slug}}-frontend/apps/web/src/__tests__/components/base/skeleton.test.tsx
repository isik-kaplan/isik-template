import { Skeleton } from '@/components/base/skeleton'

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Skeleton', () => {
  it('applies its base animation/shape styling and merges an extra className', () => {
    const { container } = render(<Skeleton className="custom-class" />)

    const el = container.querySelector('[data-slot="skeleton"]') as HTMLElement
    expect(el.className).toContain('animate-pulse')
    expect(el.className).toContain('custom-class')
  })
})
