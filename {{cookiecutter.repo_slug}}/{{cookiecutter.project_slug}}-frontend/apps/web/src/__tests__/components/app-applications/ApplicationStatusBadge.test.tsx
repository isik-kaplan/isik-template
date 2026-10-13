import { ApplicationStatusBadge } from '@/components/app-applications/ApplicationStatusBadge'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('ApplicationStatusBadge', () => {
  it.each([
    ['approved', 'bg-primary'],
    ['pending', 'bg-secondary'],
    ['disabled', 'border-border'],
    ['withdrawn', 'bg-destructive'],
  ] as const)('marks %s apart from the rest', (approval, className) => {
    render(<ApplicationStatusBadge approval={approval} label="the label" />)

    expect(screen.getByText('the label').className).toContain(className)
  })
})
