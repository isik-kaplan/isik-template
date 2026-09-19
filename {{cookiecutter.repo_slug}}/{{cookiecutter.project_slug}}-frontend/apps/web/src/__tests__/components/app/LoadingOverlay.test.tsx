import { LoadingOverlay } from '@/components/app/LoadingOverlay'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('LoadingOverlay', () => {
  it('renders children plainly when neither loading nor disabled', () => {
    const { container } = render(
      <LoadingOverlay>
        <p>content</p>
      </LoadingOverlay>
    )

    const content = screen.getByText('content')
    expect(content.parentElement?.getAttribute('aria-hidden')).toBe('false')
    expect(content.parentElement?.className).toBe('')
    expect(container.querySelector('.text-muted-foreground')).toBeNull()
  })

  it('merges an extra className onto the outer wrapper, alongside "relative"', () => {
    const { container } = render(
      <LoadingOverlay className="custom-class">
        <p>content</p>
      </LoadingOverlay>
    )

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('relative')
    expect(wrapper.className).toContain('custom-class')
  })

  it('dims and marks children inert, and shows a skeleton rather than a message, while loading', () => {
    render(
      <LoadingOverlay loading message="Read-only">
        <p>content</p>
      </LoadingOverlay>
    )

    const content = screen.getByText('content')
    expect(content.parentElement?.getAttribute('aria-hidden')).toBe('true')
    expect(content.parentElement?.className).toBe('pointer-events-none opacity-50 transition-opacity')
    expect(document.querySelector('[data-slot="skeleton"]')).toBeTruthy()
    expect(screen.queryByText('Read-only')).toBeNull()
  })

  it('shows a message instead of a skeleton when disabled without loading', () => {
    render(
      <LoadingOverlay disabled message="Read-only">
        <p>content</p>
      </LoadingOverlay>
    )

    expect(screen.getByText('Read-only')).toBeTruthy()
    expect(document.querySelector('[data-slot="skeleton"]')).toBeNull()
  })

  it('shows neither a message nor a skeleton when disabled with no message', () => {
    const { container } = render(
      <LoadingOverlay disabled>
        <p>content</p>
      </LoadingOverlay>
    )

    expect(document.querySelector('[data-slot="skeleton"]')).toBeNull()
    expect(container.querySelector('.text-muted-foreground')).toBeNull()
  })
})
